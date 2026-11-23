/**
 * What the data tags name aircraft by, per seat: CDC (the air picture) by tactical callsign, every
 * other radar seat (CATCC, the Bridge) by MODEX. A toolbar switch overrides it for the seat,
 * remembered in this browser; switching back to the seat's default drops the override.
 */
import { useState } from 'react';
import { TAG_IDS, type TagId } from './scopeModel.ts';
import type { SeatDef } from './seats.ts';

type SeatRef = Pick<SeatDef, 'id' | 'loc'>;

export const tagDefault = (seat: SeatRef): TagId => (seat.loc === 'cdc' ? 'cs' : 'bd');
export const tagKey = (seat: SeatRef) => `catcc.tag.${seat.id}`;

export function loadTagId(seat: SeatRef): TagId {
  try {
    const v = localStorage.getItem(tagKey(seat));
    return TAG_IDS.includes(v as TagId) ? (v as TagId) : tagDefault(seat);
  } catch {
    return tagDefault(seat);
  }
}

export function saveTagId(seat: SeatRef, v: TagId) {
  try {
    if (v === tagDefault(seat)) localStorage.removeItem(tagKey(seat));
    else localStorage.setItem(tagKey(seat), v);
  } catch {
    /* private window */
  }
}

/** The seat's tag name and a switch that steps MODEX → callsign → both → MODEX (saved). */
export function useTagId(seat: SeatRef): [TagId, () => void] {
  const [v, setV] = useState<TagId>(() => loadTagId(seat));
  return [
    v,
    () => {
      const n: TagId = TAG_IDS[(TAG_IDS.indexOf(v) + 1) % TAG_IDS.length];
      setV(n);
      saveTagId(seat, n);
    },
  ];
}
