/**
 * Projection-vector time, chosen on each radar display's toolbar: cycles 1 → 2 → 5 → 10 → 30 → 1 s.
 * One setting per display type (the radar scope on every seat; the Approach / Final displays),
 * remembered in this browser.
 */
import { useState } from 'react';

export const VEC_STEPS = [1, 2, 5, 10, 30] as const;
export type VecSeconds = (typeof VEC_STEPS)[number];
export type VecDisplay = 'radar' | 'final';

/** Primary radar 30 s; Approach / Final 10 s. */
export const VEC_DEFAULT: Record<VecDisplay, VecSeconds> = { radar: 30, final: 10 };
export const vecKey = (d: VecDisplay) => `catcc.vec.${d}`;

export const nextVec = (s: VecSeconds): VecSeconds => VEC_STEPS[(VEC_STEPS.indexOf(s) + 1) % VEC_STEPS.length];

export function loadVec(d: VecDisplay): VecSeconds {
  try {
    const v = Number(localStorage.getItem(vecKey(d)));
    return (VEC_STEPS as readonly number[]).includes(v) ? (v as VecSeconds) : VEC_DEFAULT[d];
  } catch {
    return VEC_DEFAULT[d];
  }
}

export function saveVec(d: VecDisplay, s: VecSeconds) {
  try {
    localStorage.setItem(vecKey(d), String(s));
  } catch {
    /* private window */
  }
}

/** The display's vector time and a step to the next one (saved). */
export function useVecSeconds(d: VecDisplay): [VecSeconds, () => void] {
  const [s, setS] = useState<VecSeconds>(() => loadVec(d));
  return [
    s,
    () => {
      const n = nextVec(s);
      setS(n);
      saveVec(d, n);
    },
  ];
}
