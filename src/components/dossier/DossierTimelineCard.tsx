import React, { useState, useMemo } from 'react';
import { EmptyState, Icon, IconButton, SectionCard, Toast, controlClass, legibleColor, tint, readable } from '../ui/primitives';
import type { IconName } from '../ui/primitives';
import { formatDossierDate } from './dossierStyles';
import type { TimelineEvent, TimelineEventType } from '../../utils/dossierService';

export interface SquadronPalette {
  primary?: string;
  secondary?: string;
  accent?: string;
}

interface DossierTimelineCardProps {
  timeline: TimelineEvent[];
  loading: boolean;
  canEdit: boolean;
  onDeleteEvent: (event: TimelineEvent) => void;
  onEditEventDate: (event: TimelineEvent, newDate: string) => void;
  busyEventId: string | null;
  errorMessage?: string | null;
  // Squadron color palette (from squadron settings); null = token colours
  squadronPalette?: SquadronPalette | null;
}

/** Kit icon per milestone type (same line icons as the rest of the app). */
const EVENT_ICON: Record<TimelineEventType, IconName> = {
  squadron: 'shield',
  billet: 'briefcase',
  qualification: 'checkCircle',
  standing: 'star',
  status: 'activity',
  graduation: 'training',
  cruise: 'anchor',
  award: 'award',
};

const EVENT_LABEL: Record<TimelineEventType, string> = {
  squadron: 'Squadron',
  billet: 'Billet',
  qualification: 'Qualification',
  standing: 'Standing',
  status: 'Status',
  graduation: 'Graduation',
  cruise: 'Cruise',
  award: 'Award',
};

/** Theme tokens (legible in light and dark). */
const TOKEN_COLORS: Record<TimelineEventType, string> = {
  squadron: 'var(--rr-info)',
  billet: 'var(--rr-purple)',
  qualification: 'var(--rr-accent-text)',
  standing: 'var(--rr-good)',
  status: 'var(--rr-text2)',
  graduation: 'var(--rr-warn)',
  cruise: 'var(--rr-info)',
  award: 'var(--rr-warn)',
};

// ---- Squadron palette derivation ------------------------------------------------------------
// The palette has up to three colours; the timeline needs eight. Derive related colours by
// shifting hue/lightness, then pass through legibleColor so they read on both themes.

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const match = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const num = parseInt(match[1], 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(channel(hue + 1 / 3))}${toHex(channel(hue))}${toHex(channel(hue - 1 / 3))}`;
}

function derive(hex: string, deltaHue = 0, deltaLightness = 0, deltaSaturation = 0): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  const l = Math.min(0.62, Math.max(0.3, hsl.l + deltaLightness));
  const s = Math.min(1, Math.max(0.2, hsl.s + deltaSaturation));
  return hslToHex(hsl.h + deltaHue, s, l);
}

function buildEventColors(palette: SquadronPalette | null | undefined): Record<TimelineEventType, string> {
  const primary = palette?.primary && hexToHsl(palette.primary) ? palette.primary : null;
  if (!primary) return TOKEN_COLORS;
  const secondary = palette?.secondary && hexToHsl(palette.secondary) ? palette.secondary : derive(primary, 30);
  const accent = palette?.accent && hexToHsl(palette.accent) ? palette.accent : derive(primary, -30);
  const raw: Record<TimelineEventType, string> = {
    squadron: derive(primary),
    billet: derive(secondary),
    qualification: derive(accent),
    standing: derive(primary, 0, 0.12),
    status: derive(secondary, 0, 0.1, -0.25),
    graduation: derive(accent, 40),
    cruise: derive(primary, -40),
    award: derive(accent, -40, -0.04),
  };
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, legibleColor(v, TOKEN_COLORS[k as TimelineEventType])])) as Record<TimelineEventType, string>;
}

const yearOf = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? String(d.getFullYear()) : 'Undated';
};

/**
 * Service history: milestones grouped by year on a thin rail. Each entry has a tinted
 * rounded-square marker with a line icon (kit style), coloured by milestone type.
 */
const DossierTimelineCard: React.FC<DossierTimelineCardProps> = ({
  timeline,
  loading,
  canEdit,
  onDeleteEvent,
  onEditEventDate,
  busyEventId,
  errorMessage = null,
  squadronPalette = null,
}) => {
  const [editMode, setEditMode] = useState(false);
  const colors = useMemo(() => buildEventColors(squadronPalette), [squadronPalette]);

  const groups = useMemo(() => {
    const out: Array<{ year: string; items: TimelineEvent[] }> = [];
    timeline.forEach(ev => {
      const y = yearOf(ev.date);
      if (!out.length || out[out.length - 1].year !== y) out.push({ year: y, items: [] });
      out[out.length - 1].items.push(ev);
    });
    return out;
  }, [timeline]);

  return (
    <SectionCard
      title="Timeline"
      count={loading ? undefined : timeline.length}
      className="h-full min-h-0"
      action={canEdit ? (
        <IconButton
          icon={editMode ? 'check' : 'edit'}
          size={26}
          iconSize={13}
          variant={editMode ? 'filled' : 'ghost'}
          label={editMode ? 'Done editing' : 'Edit timeline (fix dates, remove erroneous records)'}
          onClick={() => setEditMode(m => !m)}
        />
      ) : null}
    >
      <div className="h-full overflow-y-auto p-[14px] flex flex-col gap-[10px]">
        {editMode ? (
          <Toast tone="warn">Change an entry's date, or delete it to permanently remove the underlying history record.</Toast>
        ) : null}
        {errorMessage ? <Toast tone="bad">{errorMessage}</Toast> : null}

        {loading ? (
          <div className="py-6 text-center text-[12.5px] text-text2">Loading timeline…</div>
        ) : timeline.length === 0 ? (
          <EmptyState compact icon="clock" title="No milestones yet" message="Assignments, qualifications and awards appear here as they're recorded." />
        ) : (
          groups.map(g => (
            <div key={g.year} className="flex flex-col">
              <div className="flex items-center gap-2 font-mono text-[9.5px] tracking-[.14em] uppercase text-text3 mb-[6px]">
                <span>{g.year}</span>
                <span className="flex-1 h-px bg-border" />
              </div>
              {g.items.map((event, i) => {
                const color = colors[event.type] || colors.status;
                const isBusy = busyEventId === event.id;
                const last = i === g.items.length - 1;
                return (
                  <div key={event.id} className="relative flex gap-[11px]" style={{ opacity: isBusy ? 0.4 : 1 }}>
                    {/* Rail: marker + connector to the next entry in the year */}
                    <div className="relative flex-none flex flex-col items-center w-[28px]">
                      <span
                        title={EVENT_LABEL[event.type]}
                        className="relative z-[1] w-[28px] h-[28px] rounded-[8px] flex items-center justify-center"
                        style={{ background: tint(color, 15), boxShadow: `inset 0 0 0 1px ${tint(color, 40)}`, color: readable(color) }}
                      >
                        <Icon name={EVENT_ICON[event.type] || 'activity'} size={14} />
                      </span>
                      {!last ? <span className="flex-1 w-px bg-border my-[3px]" /> : null}
                    </div>

                    <div className={`flex-1 min-w-0 ${last ? 'pb-[4px]' : 'pb-[12px]'}`}>
                      {editMode && event.source ? (
                        <input
                          type="date"
                          defaultValue={(event.date || '').split('T')[0]}
                          disabled={isBusy}
                          onChange={e => {
                            const newDate = e.target.value;
                            if (newDate && newDate !== (event.date || '').split('T')[0]) onEditEventDate(event, newDate);
                          }}
                          className={`${controlClass} w-auto px-2 h-[24px] text-[11.5px] font-mono`}
                        />
                      ) : (
                        <div className="font-mono text-[10.5px] text-text3 leading-[16px]">{formatDossierDate(event.date)}</div>
                      )}
                      <div className="text-[13px] font-semibold text-text leading-[1.35]">{event.title}</div>
                      {event.subtitle ? <div className="text-[12px] text-text2 leading-[1.35]">{event.subtitle}</div> : null}
                    </div>

                    {editMode && event.source ? (
                      <IconButton
                        icon="trash"
                        size={26}
                        iconSize={13}
                        label="Delete this history record"
                        className="hover:!text-bad mt-[2px]"
                        disabled={isBusy}
                        onClick={() => onDeleteEvent(event)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
};

export default DossierTimelineCard;
