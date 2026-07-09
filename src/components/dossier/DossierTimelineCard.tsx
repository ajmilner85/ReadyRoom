import React, { useState, useMemo } from 'react';
import { Users, Award, Star, Anchor, GraduationCap, Activity, Briefcase, Pencil, Trash2, X, Medal } from 'lucide-react';
import { dossierStyles, formatDossierDate } from './dossierStyles';
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
  // Squadron color palette (from squadron settings); null = default colors
  squadronPalette?: SquadronPalette | null;
}

const EVENT_ICONS: Record<TimelineEventType, React.ReactNode> = {
  squadron: <Users size={12} />,
  billet: <Briefcase size={12} />,
  qualification: <Award size={12} />,
  standing: <Star size={12} />,
  status: <Activity size={12} />,
  graduation: <GraduationCap size={12} />,
  cruise: <Anchor size={12} />,
  award: <Medal size={12} />
};

const DEFAULT_EVENT_COLORS: Record<TimelineEventType, string> = {
  squadron: '#3B82F6',
  billet: '#8B5CF6',
  qualification: '#F97316',
  standing: '#10B981',
  status: '#64748B',
  graduation: '#EAB308',
  cruise: '#0EA5E9',
  award: '#B45309'
};

// ---- Palette derivation ----------------------------------------------------
// The squadron palette only has up to three colors; the timeline needs eight.
// Derive related colors by shifting hue/lightness in HSL space, clamping
// lightness so the white icons stay legible.

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

/** Shift a hex color and clamp lightness to keep white icon text readable */
function derive(hex: string, deltaHue: number = 0, deltaLightness: number = 0, deltaSaturation: number = 0): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  const l = Math.min(0.55, Math.max(0.28, hsl.l + deltaLightness));
  const s = Math.min(1, Math.max(0.15, hsl.s + deltaSaturation));
  return hslToHex(hsl.h + deltaHue, s, l);
}

function buildEventColors(palette: SquadronPalette | null | undefined): Record<TimelineEventType, string> {
  const primary = palette?.primary && hexToHsl(palette.primary) ? palette.primary : null;
  if (!primary) return DEFAULT_EVENT_COLORS;

  const secondary = palette?.secondary && hexToHsl(palette.secondary) ? palette.secondary : derive(primary, 30);
  const accent = palette?.accent && hexToHsl(palette.accent) ? palette.accent : derive(primary, -30);

  return {
    squadron: derive(primary),
    billet: derive(secondary),
    qualification: derive(accent),
    standing: derive(primary, 0, 0.12),
    status: derive(secondary, 0, 0.1, -0.25),
    graduation: derive(accent, 40),
    cruise: derive(primary, -40),
    award: derive(accent, -40, -0.04)
  };
}

const DossierTimelineCard: React.FC<DossierTimelineCardProps> = ({
  timeline,
  loading,
  canEdit,
  onDeleteEvent,
  onEditEventDate,
  busyEventId,
  errorMessage = null,
  squadronPalette = null
}) => {
  const [editMode, setEditMode] = useState(false);
  const eventColors = useMemo(() => buildEventColors(squadronPalette), [squadronPalette]);

  return (
    <div style={{ ...dossierStyles.card, width: '420px', flexShrink: 0, height: '100%' }}>
      <div style={{ ...dossierStyles.cardHeader, position: 'relative' }}>
        <span style={dossierStyles.cardHeaderText}>Timeline</span>
        {canEdit && (
          <button
            onClick={() => setEditMode(!editMode)}
            title={editMode ? 'Exit edit mode' : 'Edit timeline (remove erroneous records)'}
            style={{
              position: 'absolute',
              right: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: editMode ? '#FEE2E2' : '#FFFFFF',
              color: editMode ? '#B91C1C' : '#64748B',
              border: editMode ? '1px solid #FCA5A5' : '1px solid #CBD5E1',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {editMode ? <X size={14} /> : <Pencil size={14} />}
          </button>
        )}
      </div>
      <div style={dossierStyles.cardContent}>
        {editMode && (
          <div style={{
            padding: '8px 12px',
            marginBottom: '16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#B91C1C'
          }}>
            Edit mode: change an entry's date with the date picker, or delete it to permanently remove the underlying history record.
          </div>
        )}
        {errorMessage && (
          <div style={{
            padding: '8px 12px',
            marginBottom: '16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#B91C1C',
            fontWeight: 500
          }}>
            {errorMessage}
          </div>
        )}
        {loading ? (
          <div style={dossierStyles.emptyState}>Loading timeline...</div>
        ) : timeline.length === 0 ? (
          <div style={dossierStyles.emptyState}>No milestones recorded yet</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: '36px' }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute',
              left: '11px',
              top: '18px',
              bottom: '24px',
              width: '2px',
              backgroundColor: '#E2E8F0'
            }} />
            {timeline.map(event => {
              const appearance = {
                color: eventColors[event.type] || eventColors.status,
                icon: EVENT_ICONS[event.type] || EVENT_ICONS.status
              };
              const isBusy = busyEventId === event.id;
              return (
                <div key={event.id} style={{ position: 'relative', paddingBottom: '20px', opacity: isBusy ? 0.4 : 1 }}>
                  {/* Dot — centered on the date + title block (16px + 20px tall) */}
                  <div style={{
                    position: 'absolute',
                    left: '-36px',
                    top: '6px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: appearance.color,
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #FFFFFF',
                    boxShadow: '0 0 0 1px #E2E8F0'
                  }}>
                    {appearance.icon}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editMode && event.source ? (
                        <input
                          type="date"
                          defaultValue={(event.date || '').split('T')[0]}
                          disabled={isBusy}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            const currentDate = (event.date || '').split('T')[0];
                            if (newDate && newDate !== currentDate) {
                              onEditEventDate(event, newDate);
                            }
                          }}
                          style={{
                            fontSize: '12px',
                            color: '#0F172A',
                            border: '1px solid #CBD5E1',
                            borderRadius: '4px',
                            backgroundColor: '#F8FAFC',
                            padding: '0 4px',
                            height: '18px',
                            fontFamily: 'Inter'
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: '16px' }}>
                          {formatDossierDate(event.date)}
                        </div>
                      )}
                      <div style={{ fontSize: '14px', color: '#0F172A', fontWeight: 500, lineHeight: '20px' }}>
                        {event.title}
                      </div>
                      {event.subtitle && (
                        <div style={{ fontSize: '12px', color: '#64748B', lineHeight: '16px' }}>
                          {event.subtitle}
                        </div>
                      )}
                    </div>
                    {editMode && event.source && (
                      <button
                        onClick={() => onDeleteEvent(event)}
                        disabled={isBusy}
                        title="Delete this history record"
                        style={{
                          width: '24px',
                          height: '24px',
                          flexShrink: 0,
                          marginTop: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'transparent',
                          color: '#DC2626',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: isBusy ? 'wait' : 'pointer'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FEE2E2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DossierTimelineCard;
