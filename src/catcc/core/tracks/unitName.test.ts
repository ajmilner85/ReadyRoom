import { describe, expect, it } from 'vitest';
import { isUnitName, parsePilot } from './naming.ts';

// Pilot / Group pairs as a DCS Tacview recording has them (Fall Cruise week 5)
const ai = (pilot: string, group: string) => isUnitName(pilot, group, parsePilot(pilot).player);

describe('isUnitName: an AI aircraft carries its DCS unit name as its Pilot', () => {
  it('knows AI unit names', () => {
    expect(ai('Arco 1-1', 'Arco')).toBe(true);
    expect(ai('Darkstar 1-1', 'Darkstar-11')).toBe(true);
    expect(ai('Jeff Group 1-1-2', 'Harrier Group 1')).toBe(true);
    expect(ai('Harrier Group 1', 'Harrier Group 1')).toBe(true);
    expect(ai('Aerial-1-8', 'Aerial-1')).toBe(true);
  });
  it('keeps players', () => {
    expect(ai('Hawk 2-1 | 511 Hobo', 'Hawk 2')).toBe(false);
    expect(ai('HAWK 2-2 | 545 | Sterling', 'Hawk 2')).toBe(false);
    expect(ai('Hawk 1-2 | Bueller', 'Hawk 1')).toBe(false);
    expect(ai('Hawk 4-2/733 QUIZNOS', 'Hawk 4')).toBe(false);
    expect(ai('LSO | 571 Flick', 'Hawk 3')).toBe(false);
    expect(ai('Sting 2-2 | Ripple 772', 'Sting 2')).toBe(false);
  });
});
