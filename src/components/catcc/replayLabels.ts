/** Labels of the header's replay controls (ReplayControls.tsx). */

/** the skip interval's presets (s) */
export const SKIP_PRESETS = [30, 60, 120, 300, 600];

/** "30 s", "1 min", "1 min 30 s" */
export function skipLabel(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** recording time as h:mm:ss */
export function replayTime(mt: number): string {
  const s = Math.max(0, Math.floor(mt));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** "4×", "−2×" (only shown away from 1x) */
export function rateLabel(rate: number): string {
  return `${rate < 0 ? '−' : ''}${Math.abs(rate)}×`;
}
