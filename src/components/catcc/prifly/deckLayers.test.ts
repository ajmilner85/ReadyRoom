import { describe, expect, it } from 'vitest';
import { DECK_LAYER_DEFAULT, DECK_LAYER_ITEMS, deckDrawingLayers, parseDeckLayers } from './deckLayers.ts';

describe('deck layers', () => {
  it('lists the deck layers on the panel, by name; the Taxi Network has its own button', () => {
    expect(DECK_LAYER_ITEMS.map((i) => i[1])).toEqual(['Catapults', 'Elevators', 'Zones', 'Helo spots', 'Equipment']);
    expect(DECK_LAYER_ITEMS.map((i) => i[0]).sort()).toEqual(Object.keys(DECK_LAYER_DEFAULT).filter((k) => k !== 'taxi').sort());
  });

  it('defaults to what the deck showed before the panel: catapults, elevators, zones, equipment', () => {
    expect(parseDeckLayers(null)).toEqual({ cats: true, elev: true, areas: true, gear: true, helo: false, taxi: false });
    expect(parseDeckLayers('not json')).toEqual(DECK_LAYER_DEFAULT);
  });

  it('keeps a choice saved by the earlier row of buttons (a list of what is on); catapults and elevators stay on', () => {
    expect(parseDeckLayers(JSON.stringify({ l: ['taxi', 'helo', 'catRoutes'] }))).toEqual({ cats: true, elev: true, areas: false, gear: false, helo: true, taxi: true });
    expect(parseDeckLayers(JSON.stringify({ l: [] }))).toEqual({ ...DECK_LAYER_DEFAULT, areas: false, gear: false });
  });

  it('reads back what it saves, and ignores layers that are gone (the AI routes)', () => {
    const v = { ...DECK_LAYER_DEFAULT, cats: false, taxi: true };
    expect(parseDeckLayers(JSON.stringify({ on: v }))).toEqual(v);
    expect(parseDeckLayers(JSON.stringify({ on: { elev: false, catRoutes: true, parkRoutes: true } }))).toEqual({ ...DECK_LAYER_DEFAULT, elev: false });
  });

  it('hands the drawing its optional layers and the base features to hide', () => {
    const d = deckDrawingLayers({ ...DECK_LAYER_DEFAULT, elev: false, taxi: true });
    expect([...d.layers].sort()).toEqual(['areas', 'gear', 'taxi']);
    expect([...d.hide]).toEqual(['elev']);
    expect(deckDrawingLayers(DECK_LAYER_DEFAULT).hide.size).toBe(0);
  });
});
