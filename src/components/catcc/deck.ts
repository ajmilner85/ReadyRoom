/**
 * Deck status is shared state owned by PriFly: its call (CLEAR / FOUL with a reason) wins; without
 * one, the deck is foul while an aircraft is in the landing area.
 */
import type { OpsState } from '../../catcc/core/room/ops.ts';
import { deckStatus } from './prifly/BossView.tsx';
import type { Picture } from './scopeModel.ts';

export interface DeckCall {
  foul: boolean;
  reason?: string;
  /** true when PriFly set it; false when derived from the picture */
  called: boolean;
  aboard: number;
}

export function deckCall(pic: Picture, ops?: OpsState): DeckCall | null {
  const st = deckStatus(pic);
  if (!st) return null;
  if (ops?.deck) return { foul: ops.deck.foul, reason: ops.deck.reason, called: true, aboard: st.jets.length };
  const inLa = st.foul.map((j) => j.t.bd ?? j.t.cs ?? j.t.id);
  return { foul: inLa.length > 0, reason: inLa.length ? `${inLa.join(' ')} in the landing area` : undefined, called: false, aboard: st.jets.length };
}
