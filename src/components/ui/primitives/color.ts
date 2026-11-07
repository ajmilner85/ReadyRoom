/** Colour helpers shared by primitives (no React). */

export function hexLuminance(hex: string): number | null {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

/**
 * Make an admin-configured colour legible as text/icon on panels in either theme.
 * Very dark colours (e.g. VFA-44 #005774) and very light ones are mixed toward --rr-text,
 * which lifts them in dark theme and deepens them in light theme. Mid-tones pass through.
 */
export function legibleColor(color?: string | null, fallback = 'var(--rr-text2)'): string {
  if (!color) return fallback;
  const L = color.startsWith('#') ? hexLuminance(color) : null;
  if (L === null) return color;
  if (L < 0.12) return `color-mix(in oklab, ${color} 58%, var(--rr-text))`;
  if (L > 0.6) return `color-mix(in oklab, ${color} 55%, var(--rr-text))`;
  return color;
}

/** Foreground for a tinted tag in an admin colour: stronger mix toward text for dark colours. */
export function tagForeground(color: string): string {
  const L = color.startsWith('#') ? hexLuminance(color) : null;
  const pct = L !== null && L < 0.06 ? 35 : L !== null && L < 0.15 ? 50 : 65;
  return `color-mix(in oklab, ${color} ${pct}%, var(--rr-text))`;
}

/**
 * Base colour for a tinted tag. Near-black admin colours (e.g. #000000, #00224a) would
 * produce an invisible tint on dark panels, so they are lifted toward --rr-text first.
 */
export function tagBase(color: string): string {
  const L = color.startsWith('#') ? hexLuminance(color) : null;
  if (L !== null && L < 0.03) return `color-mix(in oklab, ${color} 50%, var(--rr-text))`;
  if (L !== null && L < 0.08) return `color-mix(in oklab, ${color} 65%, var(--rr-text))`;
  return color;
}

/**
 * legibleColor() for canvases (Chart.js can't resolve CSS variables or color-mix): returns a hex,
 * mixing very dark / very light admin colours toward the current theme's --rr-text.
 */
export function legibleHex(color?: string | null, fallback = '#6B7280'): string {
  const base = color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : fallback;
  const L = hexLuminance(base);
  if (L === null || (L >= 0.12 && L <= 0.6)) return base;
  const textVar = typeof document !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--rr-text').trim()
    : '';
  const text = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(textVar) ? textVar : '#e6edf3';
  const rgb = (h: string) => {
    const x = h.replace('#', '');
    const f = x.length === 3 ? x.split('').map(c => c + c).join('') : x;
    const n = parseInt(f, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const keep = L < 0.12 ? 0.58 : 0.55;
  const [a, b] = [rgb(base), rgb(text)];
  return '#' + a.map((c, i) => Math.round(c * keep + b[i] * (1 - keep)).toString(16).padStart(2, '0')).join('');
}
