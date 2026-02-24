import type { PadButton, ApproachPhase } from '../types/lsoTypes';

// Default grading pad buttons matching the UI sketch layout.
//
// Exclusivity rules (per phase):
//   gs       — Glide Slope: only one of HI/LO/CD/B/flythrough active at a time
//   desc     — Descent Rate: only one of TMRD/NERD/SRD/S active at a time
//   speed    — Speed: only F or SLO active at a time
//   power    — Power: only one of NEP/TMP/EG active at a time (P is a non-exclusive modifier)
//   lineup   — Line Up: only one direction/overshoot active at a time
//   attitude — Attitude: only one of NEA/TMA active at a time (A is a non-exclusive modifier)
//
// Special buttons (handled outside normal deviation logic):
//   OC  — prefix modifier for the most recent deviation in the current phase
//   AA  — Angled Approach: not phase-specific; stored as aaSeverity in GradeEntry
//   P   — Power modifier; conjugates with R, OC, WU (binary toggle, no severity states)
//   A   — Attitude modifier; conjugates with R, OC, WU (binary toggle, no severity states)
//
// Note: PATTERN (TWA/TCA) buttons are in the dedicated pattern row — excluded here.

export const DEFAULT_PAD_BUTTONS: PadButton[] = [
  // GLIDE SLOPE — all exclusive with each other
  { symbol: 'HI',  label: 'HI',  category: 'GLIDE SLOPE', exclusiveGroup: 'gs' },
  { symbol: 'LO',  label: 'LO',  category: 'GLIDE SLOPE', exclusiveGroup: 'gs' },
  { symbol: 'C',   label: 'C',   category: 'GLIDE SLOPE', exclusiveGroup: 'gs' },
  { symbol: 'S',   label: 'S',   category: 'GLIDE SLOPE', exclusiveGroup: 'gs' },
  { symbol: 'CD',  label: 'CD',  category: 'GLIDE SLOPE', exclusiveGroup: 'gs' },
  { symbol: 'B',   label: 'B',   category: 'GLIDE SLOPE', exclusiveGroup: 'gs' },
  { symbol: '/',   label: '/',   category: 'GLIDE SLOPE', exclusiveGroup: 'gs' },
  { symbol: '\\',  label: '\\',  category: 'GLIDE SLOPE', exclusiveGroup: 'gs' },

  // DESCENT RATE — all exclusive with each other
  { symbol: 'TMRD', label: 'TMRD', category: 'DESCENT RATE', exclusiveGroup: 'desc' },
  { symbol: 'NERD', label: 'NERD', category: 'DESCENT RATE', exclusiveGroup: 'desc' },
  { symbol: 'SRD',  label: 'SRD',  category: 'DESCENT RATE', exclusiveGroup: 'desc' },
  { symbol: 'DESC_SPACER', label: '', category: 'DESCENT RATE', isLabel: true },
  { symbol: 'SPEED_LABEL', label: 'SPEED', category: 'DESCENT RATE', isLabel: true },
  { symbol: 'F',    label: 'F',    category: 'DESCENT RATE', exclusiveGroup: 'speed' },
  { symbol: 'SLO',  label: 'SLO',  category: 'DESCENT RATE', exclusiveGroup: 'speed' },

  // POWER — TMP/NEP/EG are exclusive; P is a binary modifier that conjugates with R/OC/WU
  { symbol: 'TMP', label: 'TMP', category: 'POWER', exclusiveGroup: 'power' },
  { symbol: 'NEP', label: 'NEP', category: 'POWER', exclusiveGroup: 'power' },
  { symbol: 'P',   label: 'P',   category: 'POWER', binaryToggle: true },
  { symbol: 'EG',  label: 'EG',  category: 'POWER', exclusiveGroup: 'power' },

  // LINE UP — US is non-exclusive; direction/overshoot buttons are mutually exclusive
  { symbol: 'US',   label: 'US',   category: 'LINE UP', exclusiveGroup: 'lineup' },
  { symbol: 'OS',   label: 'OS',   category: 'LINE UP', exclusiveGroup: 'lineup' },
  // CB conjugates with US or OS to form USCB/OSCB in the shorthand; binary modifier
  { symbol: 'CB',   label: 'CB',   category: 'LINE UP', binaryToggle: true },
  { symbol: 'LUL',  label: 'LUL',  category: 'LINE UP', exclusiveGroup: 'lineup' },
  { symbol: 'LUR',  label: 'LUR',  category: 'LINE UP', exclusiveGroup: 'lineup' },
  { symbol: 'DL',   label: 'DL',   category: 'LINE UP', exclusiveGroup: 'lineup' },
  { symbol: 'DR',   label: 'DR',   category: 'LINE UP', exclusiveGroup: 'lineup' },
  // AA is in the LINE UP row visually but is NOT phase-specific — handled via aaSeverity
  { symbol: 'AA',   label: 'AA',   category: 'LINE UP' },

  // CONTROL — technique/control deviations
  // OC is a prefix modifier (not a deviation itself); appears first as reference
  { symbol: 'OC',  label: 'OC',  category: 'CONTROL' },
  { symbol: 'R',   label: 'R',   category: 'CONTROL' },
  { symbol: 'WU',  label: 'WU',  category: 'CONTROL' },

  // AIRCRAFT — aircraft-specific deviations (rendered inline with CONTROL row, binary on/off only)
  { symbol: 'N',  label: 'N',  category: 'AIRCRAFT', binaryToggle: true },
  { symbol: 'W',  label: 'W',  category: 'AIRCRAFT', binaryToggle: true },
  { symbol: 'RR', label: 'RR', category: 'AIRCRAFT', binaryToggle: true },

  // ATTITUDE — TMA/NEA are exclusive; A is a binary modifier that conjugates with R/OC/WU
  { symbol: 'TMA', label: 'TMA', category: 'ATTITUDE', exclusiveGroup: 'attitude' },
  { symbol: 'NEA', label: 'NEA', category: 'ATTITUDE', exclusiveGroup: 'attitude' },
  { symbol: 'A',   label: 'A',   category: 'ATTITUDE', binaryToggle: true },

  // ARRESTMENT — mutually exclusive outcomes (BLTR used internally to avoid clash with GS B)
  // binaryToggle: single tap = active, second tap = clear; rendered inline to the right of WIRE row
  { symbol: 'BLTR', label: 'B',   category: 'ARRESTMENT', exclusiveGroup: 'arrestment', binaryToggle: true },
  { symbol: 'HS',   label: 'HS',  category: 'ARRESTMENT', exclusiveGroup: 'arrestment', binaryToggle: true },
  { symbol: 'T&G',  label: 'T&G', category: 'ARRESTMENT', exclusiveGroup: 'arrestment', binaryToggle: true },

  // WAVE OFF — mutually exclusive wave-off types; rendered inline to the right of groove timer
  { symbol: 'WO',   label: 'WO',   category: 'WAVE OFF', exclusiveGroup: 'waveoff', binaryToggle: true },
  { symbol: 'WOFD', label: 'WOFD', category: 'WAVE OFF', exclusiveGroup: 'waveoff', binaryToggle: true },
  { symbol: 'OWO',  label: 'OWO',  category: 'WAVE OFF', exclusiveGroup: 'waveoff', binaryToggle: true },
];

// Categories that share a row in the grading pad.
// Key = primary category; spacer=true inserts an empty cell between the two sections.
export interface RowGroup { secondary: string; spacer: boolean; }
export const ROW_GROUPS: Record<string, RowGroup> = {
  CONTROL:     { secondary: 'AIRCRAFT', spacer: true  },
  POWER:       { secondary: 'ATTITUDE', spacer: false },
};

// Override display text for category labels (supports \n for line breaks).
export const CATEGORY_LABELS: Record<string, string> = {};

// Categories rendered inline with other rows (not as standalone grading pad rows).
export const INLINE_CATEGORIES: ReadonlySet<string> = new Set(['ARRESTMENT', 'WAVE OFF']);

// Comment buttons — appended to the end of the grading string when active.
// Buttons with label2 cycle through two active states (state 1 = label1, state 2 = label2).
export interface CommentButton {
  key: string;
  label1: string;
  label2?: string;
}

export const COMMENT_BUTTONS: CommentButton[] = [
  { key: 'TTH',    label1: 'TTH' },
  { key: 'AFU',    label1: 'AFU' },
  { key: 'FUBAR',  label1: 'FUBAR' },
  { key: 'HUA',    label1: 'HUA' },
  { key: 'HNIWHD', label1: 'HNIWHD', label2: 'HNFIWD' },
  { key: 'DNKHS',  label1: 'DNKHS',  label2: 'DNKUA' },
  { key: 'OGSH',   label1: 'OGSH' },
  { key: 'HAE',    label1: 'HAE' },
];

// Phase-specific button overrides. If a phase has an entry here,
// only the listed symbols will be shown. If not listed, all DEFAULT_PAD_BUTTONS are shown.
export const PHASE_BUTTON_OVERRIDES: Partial<Record<ApproachPhase, string[]>> = {
  // All phases show all buttons by default for now.
};

// Get the buttons available for a given phase
export function getButtonsForPhase(phase: ApproachPhase): PadButton[] {
  const overrides = PHASE_BUTTON_OVERRIDES[phase];
  if (overrides) {
    return DEFAULT_PAD_BUTTONS.filter(b => overrides.includes(b.symbol));
  }
  return DEFAULT_PAD_BUTTONS;
}

// Get unique category names in display order
export function getCategoriesForPhase(phase: ApproachPhase): string[] {
  const buttons = getButtonsForPhase(phase);
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const btn of buttons) {
    if (!seen.has(btn.category)) {
      seen.add(btn.category);
      categories.push(btn.category);
    }
  }
  return categories;
}
