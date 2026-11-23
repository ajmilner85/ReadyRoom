/**
 * The flight deck drawing's switchable layers: what the Layers panel lists, each layer's default, and how
 * the choice is kept in this browser (`catcc.deck.layers`). The Taxi Network is kept here too, though its
 * switch is a button of its own beside the panel.
 */
import type { DeckBase, DeckLayer } from './deck.ts';

/** every switch: the deck's base features (on unless turned off) and its optional layers */
export type DeckToggle = DeckBase | DeckLayer;

/** the Layers panel's rows: [layer, name, the colour of its check box (the colour the layer is drawn in)] */
export const DECK_LAYER_ITEMS: [DeckToggle, string, string][] = [
  ['cats', 'Catapults', '#C9D3DD'],
  ['elev', 'Elevators', '#B9923A'],
  ['areas', 'Zones', '#6FB6E6'],
  ['helo', 'Helo spots', '#838C95'],
  ['gear', 'Equipment', '#6E7A88'],
];

export const DECK_LAYER_DEFAULT: Record<DeckToggle, boolean> = { cats: true, elev: true, areas: true, helo: false, gear: true, taxi: false };
export const DECK_LAYER_KEY = 'catcc.deck.layers';

const KEYS = Object.keys(DECK_LAYER_DEFAULT) as DeckToggle[];
/** the layers a choice saved before the Layers panel covers: it was a list of the layers that were on */
const LISTED: DeckToggle[] = ['areas', 'taxi', 'helo', 'gear'];

/**
 * The layers from what is stored. Stored now: `{ on: { layer: boolean } }`. Stored by the earlier row of
 * buttons: `{ l: [layers that are on] }`, which said nothing of the catapults and elevators: those take
 * their default. A layer the stored value does not know takes its default; a stored layer that no longer
 * exists (the AI route layers) is ignored.
 */
export function parseDeckLayers(raw: string | null | undefined): Record<DeckToggle, boolean> {
  const out = { ...DECK_LAYER_DEFAULT };
  if (!raw) return out;
  try {
    const v = JSON.parse(raw) as { on?: Record<string, unknown>; l?: unknown };
    if (v && typeof v.on === 'object' && v.on) {
      for (const k of KEYS) if (typeof v.on[k] === 'boolean') out[k] = v.on[k] as boolean;
    } else if (v && Array.isArray(v.l)) {
      for (const k of LISTED) out[k] = v.l.includes(k);
    }
  } catch {
    /* unreadable: the defaults */
  }
  return out;
}

export const loadDeckLayers = (): Record<DeckToggle, boolean> => {
  try {
    return parseDeckLayers(localStorage.getItem(DECK_LAYER_KEY));
  } catch {
    return { ...DECK_LAYER_DEFAULT };
  }
};
export const saveDeckLayers = (v: Record<DeckToggle, boolean>) => {
  try {
    localStorage.setItem(DECK_LAYER_KEY, JSON.stringify({ on: v }));
  } catch {
    /* private window */
  }
};

/** what DeckDrawing takes: the optional layers that are on, and the base features turned off */
export function deckDrawingLayers(v: Record<DeckToggle, boolean>): { layers: Set<DeckLayer>; hide: Set<DeckBase> } {
  const layers = new Set<DeckLayer>();
  const hide = new Set<DeckBase>();
  for (const k of KEYS) {
    if (k === 'cats' || k === 'elev') {
      if (!v[k]) hide.add(k);
    } else if (v[k]) layers.add(k);
  }
  return { layers, hide };
}
