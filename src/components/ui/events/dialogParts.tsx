import React from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon, NumberStepper, SegmentedControl, Select, Toggle } from '../primitives';

/**
 * Building blocks shared by the Event and Cycle dialogs: modal shell, section cards,
 * switch rows and the Discord role picker. Kept here so both dialogs stay visually identical.
 */

export type ReminderUnit = 'minutes' | 'hours' | 'days';
export const UNIT_OPTIONS: Array<{ value: ReminderUnit; label: string }> = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
];
export const unitWord = (value: number, unit: ReminderUnit) => (value === 1 ? unit.replace(/s$/, '') : unit);

/** Portal + overlay + panel. Clicking the overlay only closes when the press also started there. */
export const DialogShell: React.FC<{
  label: string;
  onClose: () => void;
  width: string;
  height: string;
  children: React.ReactNode;
  zIndex?: number;
}> = ({ label, onClose, width, height, children, zIndex = 1000 }) => {
  const downOnOverlay = React.useRef(false);
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-6 max-[760px]:p-2"
      style={{ zIndex, background: 'var(--rr-overlay)', animation: 'rrFadeIn .15s ease' }}
      onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnOverlay.current && e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="flex flex-col bg-panel border border-border2 rounded-rr-2xl shadow-rr-lg overflow-hidden text-text"
        style={{ width, height, maxWidth: '100%', maxHeight: '100%', animation: 'rrPopIn .18s ease' }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

export const StepIntro: React.FC<{ title: string; text: React.ReactNode }> = ({ title, text }) => (
  <div className="mb-[2px]">
    <div className="text-[15px] font-semibold text-text">{title}</div>
    <div className="text-[12.5px] text-text2 mt-[2px] leading-[1.45]">{text}</div>
  </div>
);

/** Bordered section card. `flush` drops body padding (for SettingRow lists). */
export const DlgCard: React.FC<{
  title?: string;
  description?: React.ReactNode;
  count?: number;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  flush?: boolean;
  className?: string;
  children?: React.ReactNode;
}> = ({ title, description, count, right, footer, flush, className = '', children }) => (
  <section className={`rounded-rr-lg border border-border bg-panel overflow-hidden ${className}`}>
    {title || right ? (
      <div className="flex items-start gap-3 px-[14px] pt-[12px] pb-[10px] border-b border-border">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {title ? <span className="rr-pane-title">{title}</span> : null}
            {count != null ? <span className="font-mono text-[11px] text-text3">{count}</span> : null}
          </div>
          {description ? <div className="text-[12px] text-text2 mt-[3px] leading-[1.45]">{description}</div> : null}
        </div>
        {right ? <div className="flex-none flex items-center">{right}</div> : null}
      </div>
    ) : null}
    {children ? <div className={flush ? 'divide-y divide-border' : 'p-[14px]'}>{children}</div> : null}
    {footer ? <div className="px-[14px] py-[8px] text-[11.5px] text-text2 border-t border-border bg-panel2">{footer}</div> : null}
  </section>
);

/** Label + description on the left, switch on the right. The whole row toggles. */
export const SettingRow: React.FC<{ label: React.ReactNode; description?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({
  label, description, checked, onChange, disabled,
}) => (
  <div
    className={`flex items-center gap-4 px-[14px] py-[12px] ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-panel2'}`}
    onClick={(e) => { if (!disabled && !(e.target as HTMLElement).closest('button')) onChange(!checked); }}
  >
    <div className="flex-1 min-w-0">
      <div className="text-[13.5px] font-medium text-text">{label}</div>
      {description ? <div className="text-[12px] text-text2 mt-[2px] leading-[1.4]">{description}</div> : null}
    </div>
    <Toggle checked={checked} onChange={onChange} disabled={disabled} />
  </div>
);

/** Selectable squadron tile (insignia + designation + name) used by the participating-squadron pickers. */
export const SquadronToggleTile: React.FC<{
  squadron: { id: string; designation?: string | null; name?: string | null; insignia_url?: string | null };
  selected: boolean;
  onToggle: () => void;
}> = ({ squadron, selected, onToggle }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onToggle}
    className={`flex items-center gap-[9px] px-[10px] py-[8px] rounded-rr-md border text-left cursor-pointer transition-colors ${selected ? 'border-accent bg-accent-weak' : 'border-border bg-panel2 hover:border-border2'}`}
  >
    <span
      className="flex-none w-[16px] h-[16px] rounded-[5px] flex items-center justify-center text-white"
      style={{ border: `1.5px solid ${selected ? 'var(--rr-accent)' : 'var(--rr-border2)'}`, background: selected ? 'var(--rr-accent)' : 'transparent' }}
    >
      {selected ? <Icon name="check" size={11} stroke={2.6} /> : null}
    </span>
    {squadron.insignia_url
      ? <img src={squadron.insignia_url} alt="" className="flex-none w-[22px] h-[22px] object-contain" />
      : <span className="flex-none w-[22px] h-[22px] rounded-[4px] bg-panel3" />}
    <span className="min-w-0 flex flex-col">
      <span className="text-[12.5px] font-semibold text-text truncate">{squadron.designation}</span>
      <span className="text-[11px] text-text2 truncate">{squadron.name}</span>
    </span>
  </button>
);

/** Discord role picker: select + Add, then removable @role chips. */
export const RolePicker: React.FC<{
  available: Array<{ id: string; name: string }>;
  selected: Array<{ id: string; name: string }>;
  loading: boolean;
  pendingId: string;
  onPendingChange: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  emptyText?: string;
}> = ({ available, selected, loading, pendingId, onPendingChange, onAdd, onRemove, emptyText = 'No roles will be mentioned.' }) => (
  <>
    <div className="flex gap-[8px]">
      <Select
        className="flex-1 min-w-0"
        value={pendingId}
        onChange={(v) => onPendingChange(v)}
        disabled={loading || available.length === 0}
        placeholder={loading ? 'Loading roles…' : available.length === 0 ? 'No mentionable roles available' : 'Select a Discord role'}
        options={available.filter(r => !selected.some(s => s.id === r.id)).map(r => ({ value: r.id, label: `@${r.name}` }))}
      />
      <Button variant="secondary" icon="plus" onClick={onAdd} disabled={!pendingId || loading}>Add</Button>
    </div>
    {selected.length > 0 ? (
      <div className="flex flex-wrap gap-[6px] mt-[10px]">
        {selected.map((role) => (
          <span
            key={role.id}
            className="inline-flex items-center gap-[4px] h-[26px] pl-[10px] pr-[4px] rounded-rr-md text-[12px] font-semibold"
            style={{
              background: 'color-mix(in srgb, var(--rr-purple) 14%, transparent)',
              color: 'color-mix(in oklab, var(--rr-purple) 55%, var(--rr-text))',
              border: '1px solid color-mix(in srgb, var(--rr-purple) 45%, transparent)',
            }}
          >
            @{role.name}
            <button
              type="button"
              title="Remove role"
              aria-label={`Remove @${role.name}`}
              onClick={() => onRemove(role.id)}
              className="w-[18px] h-[18px] rounded-full flex items-center justify-center border-0 bg-transparent cursor-pointer text-inherit hover:bg-black/15"
            >
              <Icon name="close" size={11} />
            </button>
          </span>
        ))}
      </div>
    ) : (
      <div className="mt-[8px] text-[11.5px] text-text3">{emptyText}</div>
    )}
  </>
);

export type RecipientKey = 'accepted' | 'tentative' | 'declined' | 'noResponse';
export const RECIPIENTS: Array<{ key: RecipientKey; label: string; color: string }> = [
  { key: 'accepted', label: 'Accepted', color: 'var(--rr-good)' },
  { key: 'tentative', label: 'Tentative', color: 'var(--rr-warn)' },
  { key: 'declined', label: 'Declined', color: 'var(--rr-bad)' },
  { key: 'noResponse', label: 'No response', color: 'var(--rr-text3)' },
];

/** Reminder: switch + summary header; when on, a value/unit row and coloured recipient pills. */
export const ReminderCard: React.FC<{
  title: string;
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  value: number;
  onValue: (v: number) => void;
  unit: ReminderUnit;
  onUnit: (u: ReminderUnit) => void;
  recipients: Record<RecipientKey, boolean>;
  onRecipient: (k: RecipientKey, v: boolean) => void;
  /** Optional label under the title when off (default 'Off'). */
  offText?: string;
}> = ({ title, enabled, onEnabled, value, onValue, unit, onUnit, recipients, onRecipient, offText = 'Off' }) => {
  const unitLabel = unitWord(value, unit);
  const chosen = RECIPIENTS.filter(r => recipients[r.key]);
  return (
    <section className={`rounded-rr-lg border bg-panel overflow-hidden transition-colors ${enabled ? 'border-border2' : 'border-border'}`}>
      <div className="flex items-center gap-3 px-[14px] py-[12px] cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) onEnabled(!enabled); }}>
        <Toggle checked={enabled} onChange={onEnabled} />
        <div className="flex-1 min-w-0">
          <div className={`text-[13.5px] font-semibold ${enabled ? 'text-text' : 'text-text2'}`}>{title}</div>
          <div className="text-[12px] text-text2">
            {enabled
              ? <>{value} {unitLabel} before start{chosen.length ? <> &middot; {chosen.map(c => c.label).join(', ')}</> : <span className="text-warn"> &middot; no recipients selected</span>}</>
              : offText}
          </div>
        </div>
      </div>
      {enabled ? (
        <div className="border-t border-border px-[14px] py-[12px] flex flex-col gap-[12px] bg-panel2">
          <div className="flex items-center gap-[10px] flex-wrap">
            <span className="rr-label w-[78px]">Send</span>
            <NumberStepper value={value} min={1} max={999} onChange={onValue} width={44} />
            <SegmentedControl size="sm" value={unit} onChange={onUnit} options={UNIT_OPTIONS} />
            <span className="text-[12.5px] text-text2">before event start</span>
          </div>
          <div className="flex items-center gap-[10px] flex-wrap">
            <span className="rr-label w-[78px]">Recipients</span>
            <div className="flex flex-wrap gap-[6px]">
              {RECIPIENTS.map(r => {
                const on = recipients[r.key];
                return (
                  <button
                    key={r.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onRecipient(r.key, !on)}
                    className={`inline-flex items-center gap-[6px] h-[28px] px-[10px] rounded-rr-ctl border text-[12.5px] font-semibold cursor-pointer transition-colors ${on ? 'text-text' : 'text-text3 border-border2 bg-transparent hover:border-accent hover:text-text2'}`}
                    style={on ? { background: `color-mix(in srgb, ${r.color} 16%, transparent)`, borderColor: `color-mix(in srgb, ${r.color} 55%, transparent)` } : undefined}
                  >
                    <span className="w-[7px] h-[7px] rounded-full" style={on ? { background: r.color } : { boxShadow: `inset 0 0 0 1.5px ${r.color}` }} />
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
