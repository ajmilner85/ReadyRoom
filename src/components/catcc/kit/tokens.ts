/**
 * CATCC design tokens: the colours, fonts and type sizes the CATCC / PriFly interface uses, gathered from
 * catcc.css and the inline styles of src/components/catcc (values copied as they are there, not rounded).
 * The kit page (/catcc/kit) shows them; scripts/catcc/figma-kit.gen.tsx carries them into the Figma plugin
 * (figma/catcc-kit) as Variables and text styles.
 */

export interface ColorToken {
  /** Figma variable name: group/name */
  name: string;
  /** CSS colour exactly as the code writes it */
  value: string;
  /** where it is used */
  use: string;
}

export const COLORS: ColorToken[] = [
  // surfaces
  { name: 'surface/app', value: '#0E1116', use: 'page (.cc-root), inputs, segmented track' },
  { name: 'surface/scope', value: '#0B0E12', use: 'radar and precision scopes' },
  { name: 'surface/bar', value: '#151A21', use: 'header, sidebars, dialogs' },
  { name: 'surface/statusbar', value: '#11161C', use: 'PriFly / LSO status bar' },
  { name: 'surface/panel', value: '#1A212A', use: '.pnl, hover rows' },
  { name: 'surface/raised', value: '#222C37', use: 'selected segment, tabs, small buttons' },
  { name: 'surface/open', value: '#3D2521', use: 'floating tool button while its popover is open' },
  { name: 'surface/float', value: 'rgba(21,26,33,.96)', use: 'scope toolbars, floating tool buttons' },
  { name: 'surface/popover', value: 'rgba(21,26,33,.97)', use: 'layers popover' },
  { name: 'surface/tag', value: 'rgba(11,14,18,.72)', use: 'data tag box' },
  { name: 'surface/scrim', value: 'rgba(0,0,0,.55)', use: 'dialog scrim' },
  // borders
  { name: 'border/subtle', value: '#262F3A', use: 'panel and bar borders' },
  { name: 'border/control', value: '#374250', use: 'buttons, inputs, dividers' },
  { name: 'border/strong', value: '#5E6A78', use: 'open seat ring, horizon' },
  // text
  { name: 'text/primary', value: '#E6EDF3', use: 'body text, values' },
  { name: 'text/secondary', value: '#C9D3DD', use: 'secondary values' },
  { name: 'text/muted', value: '#93A1B0', use: 'labels (.lbl), keys, idle tabs' },
  { name: 'text/faint', value: '#7D8896', use: 'geo labels, idle light settings' },
  { name: 'text/dim', value: '#6B7683', use: 'empty states, column heads' },
  { name: 'text/disabled', value: '#5E6A78', use: 'disabled buttons' },
  // accent
  { name: 'accent/orange', value: '#F15822', use: 'brand, own seat, active borders' },
  { name: 'accent/text', value: '#FFB08F', use: 'text on an active control' },
  { name: 'accent/hover', value: '#FF8A5C', use: 'link hover' },
  { name: 'accent/tint-12', value: 'rgba(241,88,34,.12)', use: 'own seat pill, selected option' },
  { name: 'accent/tint-15', value: 'rgba(241,88,34,.15)', use: 'case badge' },
  { name: 'accent/tint-18', value: 'rgba(241,88,34,.18)', use: 'active tool / header button' },
  // status
  { name: 'status/good', value: '#40A85B', use: 'clear deck border, live feed' },
  { name: 'status/good-text', value: '#8FE0A6', use: 'clear deck text' },
  { name: 'status/ok', value: '#7FD397', use: 'ok values, CLEAR' },
  { name: 'status/good-tint', value: 'rgba(64,168,91,.2)', use: 'clear deck fill' },
  { name: 'status/bad', value: '#E0524E', use: 'foul deck border, conflict boxes' },
  { name: 'status/bad-text', value: '#FF9C98', use: 'foul deck text' },
  { name: 'status/conflict', value: '#FF8A85', use: 'conflict contacts, bad values' },
  { name: 'status/bad-tint', value: 'rgba(224,82,78,.2)', use: 'foul deck fill' },
  { name: 'status/amber', value: '#E7B04F', use: 'warnings, handoff due, marginal' },
  { name: 'status/feed-idle', value: '#DE9A1F', use: 'feed up but idle' },
  { name: 'status/blue', value: '#3E9BD4', use: 'other carrier, blue hits, held by someone else' },
  { name: 'status/blue-tag', value: '#6FB6E6', use: 'blue tags and labels' },
  { name: 'status/neutral', value: '#E7C66B', use: 'neutral surface contacts, radar donors' },
  { name: 'status/hook', value: '#E45BEA', use: 'hooked contact, hooked tools' },
  { name: 'status/target', value: '#F2B3F5', use: 'intercept target, assigned tags' },
  // scope
  { name: 'scope/track', value: '#5FD068', use: 'own contacts, tags, vectors' },
  { name: 'scope/trail', value: '#3E9A4C', use: 'own trail dots' },
  { name: 'scope/trail-blue', value: '#2F6F99', use: 'blue trail dots' },
  { name: 'scope/trail-red', value: '#B8433F', use: 'conflict trail dots' },
  { name: 'scope/ring', value: 'rgba(64,168,91,.22)', use: 'range rings' },
  { name: 'scope/ring-faint', value: 'rgba(64,168,91,.09)', use: 'minor range rings (CDC)' },
  { name: 'scope/tick', value: 'rgba(64,168,91,.4)', use: 'compass ticks' },
  { name: 'scope/ring-label', value: '#5E9A6C', use: 'range ring labels' },
  { name: 'scope/grid', value: 'rgba(147,161,176,.14)', use: 'map grid' },
];

export interface FontToken {
  name: string;
  css: string;
  weights: number[];
  url: string;
}

export const FONTS: FontToken[] = [
  { name: 'Saira', css: "'Saira', system-ui, sans-serif", weights: [300, 400, 500, 600, 700], url: 'https://fonts.google.com/specimen/Saira' },
  { name: 'IBM Plex Mono', css: "'IBM Plex Mono', ui-monospace, monospace", weights: [400, 500, 600, 700], url: 'https://fonts.google.com/specimen/IBM+Plex+Mono' },
];

export interface TextStyleToken {
  /** Figma text style name */
  name: string;
  family: 'Saira' | 'IBM Plex Mono';
  weight: number;
  /** px */
  size: number;
  /** em, as the CSS letter-spacing */
  tracking?: number;
  upper?: boolean;
  color: string;
  sample: string;
  use: string;
}

export const TEXT_STYLES: TextStyleToken[] = [
  { name: 'Display/Hull', family: 'Saira', weight: 700, size: 26, tracking: 0.05, color: '#E6EDF3', sample: 'CVN-71', use: 'ship data panel' },
  { name: 'Display/Deck', family: 'Saira', weight: 700, size: 26, tracking: 0.04, color: '#7FD397', sample: 'CLEAR', use: 'Approach / Final deck status' },
  { name: 'Title/Logo', family: 'Saira', weight: 700, size: 18, tracking: 0.08, color: '#E6EDF3', sample: 'CATCC', use: 'header location name' },
  { name: 'Title/Slot', family: 'Saira', weight: 700, size: 18, color: '#7FD397', sample: 'Turn between 1.2–1.8 DME', use: 'bolter slot, deck bar' },
  { name: 'Title/Dialog', family: 'Saira', weight: 600, size: 15, color: '#E6EDF3', sample: 'Options', use: 'dialog title' },
  { name: 'UI/Strong', family: 'Saira', weight: 600, size: 13.5, color: '#E6EDF3', sample: 'Condensed', use: 'option titles, setting names' },
  { name: 'UI/Note', family: 'Saira', weight: 500, size: 13.5, color: '#E6EDF3', sample: 'Conflict 201 / 305', use: 'notification title' },
  { name: 'UI/Tab', family: 'Saira', weight: 400, size: 13, color: '#93A1B0', sample: 'CATCC', use: 'location and seat tabs' },
  { name: 'UI/Button', family: 'Saira', weight: 400, size: 12.5, color: '#E6EDF3', sample: 'Reference', use: 'header, segmented and outline buttons' },
  { name: 'UI/Body', family: 'Saira', weight: 400, size: 12.5, color: '#E6EDF3', sample: 'VFA-161 → CLOUD', use: 'panel rows' },
  { name: 'Mono/Clock', family: 'IBM Plex Mono', weight: 600, size: 17, color: '#E6EDF3', sample: '14:22:07Z', use: 'header clocks' },
  { name: 'Mono/Figure', family: 'IBM Plex Mono', weight: 600, size: 20, color: '#E6EDF3', sample: '345', use: 'panel headline figures' },
  { name: 'Mono/Status', family: 'IBM Plex Mono', weight: 600, size: 13, tracking: 0.12, color: '#8FE0A6', sample: 'CLEAR DECK', use: 'deck banner' },
  { name: 'Mono/Value', family: 'IBM Plex Mono', weight: 400, size: 12.5, color: '#E6EDF3', sample: '345 / 28 KT', use: 'selects, Final key/value rows' },
  { name: 'Mono/Row', family: 'IBM Plex Mono', weight: 400, size: 12, color: '#E6EDF3', sample: 'Wind over deck', use: '.kv rows' },
  { name: 'Mono/Small', family: 'IBM Plex Mono', weight: 400, size: 11.5, color: '#93A1B0', sample: 'CVN-71 feed · live', use: 'layer rows, feed, meta' },
  { name: 'Mono/Meta', family: 'IBM Plex Mono', weight: 400, size: 11, color: '#93A1B0', sample: '3 aboard', use: 'panel header meta' },
  { name: 'Mono/Chip', family: 'IBM Plex Mono', weight: 600, size: 10, tracking: 0.08, color: '#93A1B0', sample: 'MARSHAL', use: 'owner chip' },
  { name: 'Label', family: 'IBM Plex Mono', weight: 400, size: 10.5, tracking: 0.12, upper: true, color: '#93A1B0', sample: 'Wind over deck', use: '.lbl' },
  { name: 'Label/Group', family: 'IBM Plex Mono', weight: 400, size: 9.5, tracking: 0.12, upper: true, color: '#6B7683', sample: 'Traffic', use: 'layers popover groups' },
  { name: 'Scope/Tag', family: 'IBM Plex Mono', weight: 400, size: 10.4, color: '#5FD068', sample: '201 F18', use: 'data tag rows at the default tag size (0.9 units × 11.53 px)' },
  { name: 'Scope/Label', family: 'IBM Plex Mono', weight: 400, size: 9.2, color: '#93A1B0', sample: '20 NM', use: 'scope labels at the default overlay size' },
];

export const RADII = [
  { name: 'tag', px: 2, use: 'scope HTML tags' },
  { name: 'chip', px: 3, use: 'owner chip, deck chip, .fch' },
  { name: 'control', px: 4, use: 'segment, small buttons, inputs' },
  { name: 'button', px: 5, use: 'header and outline buttons, deck banner' },
  { name: 'tool', px: 6, use: '.tbtn, segmented track, notes' },
  { name: 'panel', px: 8, use: '.pnl, toolbars, popovers, scopes' },
  { name: 'dialog', px: 10, use: 'dialogs' },
  { name: 'pill', px: 19, use: 'seat pill' },
];

/** px per scope unit at the default display sizes (UI_DEF: hits, tags, overlays at step 2 = ×1.3): 860/97 × 1.3 */
export const SCOPE_UNIT_PX = (860 / 97) * 1.3;
