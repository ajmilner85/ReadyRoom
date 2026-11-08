import { useEffect, useRef, useState } from 'react';
import type { Carrier, ScopeTrack } from '../scopeModel.ts';

export interface DeckEvent {
  /** local time label */
  t: string;
  text: string;
  kind: 'trap' | 'launch';
  id: string;
}

const M_PER_NM = 1852;

/**
 * Detects traps (airborne → stopped on this carrier) and launches (on deck → airborne) from
 * frame-to-frame changes, and remembers when each aircraft landed (for the Boss deck colours).
 */
export function useDeckLog(focus: Carrier | undefined, air: ScopeTrack[], localNow: Date | undefined) {
  const prev = useRef(new Map<string, boolean>());
  const [log, setLog] = useState<DeckEvent[]>([]);
  const landedAt = useRef(new Map<string, number>());
  useEffect(() => {
    if (!focus || !localNow) return;
    const label = `${String(localNow.getUTCHours()).padStart(2, '0')}:${String(localNow.getUTCMinutes()).padStart(2, '0')}:${String(localNow.getUTCSeconds()).padStart(2, '0')}`;
    const fresh: DeckEvent[] = [];
    for (const t of air) {
      const near = Math.hypot(t.p[0] - focus.track.p[0], t.p[1] - focus.track.p[1]) * M_PER_NM < 300;
      const aboard = near && t.air === false;
      const was = prev.current.get(t.id);
      if (was !== undefined && was !== aboard) {
        const name = t.bd ?? t.cs ?? t.pi ?? t.id;
        if (aboard) {
          fresh.push({ t: label, text: `${name} trap`, kind: 'trap', id: t.id });
          landedAt.current.set(t.id, Date.now());
        } else if (near || (t.gs ?? 0) > 100) {
          fresh.push({ t: label, text: `${name} launch`, kind: 'launch', id: t.id });
          landedAt.current.delete(t.id);
        }
      }
      prev.current.set(t.id, aboard);
    }
    if (fresh.length) setLog((l) => [...fresh.reverse(), ...l].slice(0, 40));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [air]);
  return { log, landedAt: landedAt.current };
}
