import { describe, expect, it } from 'vitest';
import { finalPos, slotWindow, timeToBall, turnS } from './slot.ts';

describe('final frame', () => {
  it('measures along (astern) and lateral (right of course) from the ship', () => {
    // FB 000: astern is south (+y); right of the inbound course is east (+x)
    const f = finalPos([0.5, 4], 0, { crs: 0, gs: 150 }, { crs: 0, gs: 25 });
    expect(f.along).toBeCloseTo(4, 6);
    expect(f.lat).toBeCloseTo(0.5, 6);
    // closing at 150 - 25 kt
    expect(f.closureKt).toBeCloseTo(125, 6);
    // on the downwind (heading 180) the aircraft opens at its speed plus the ship's
    expect(finalPos([-2, 3], 0, { crs: 180, gs: 140 }, { crs: 0, gs: 25 }).alongKt).toBeCloseTo(165, 6);
  });

  it('times arrivals to the ¾ NM point', () => {
    expect(timeToBall(6, 125, 125)).toBeCloseTo(((6 - 0.75) / 125) * 3600, 6);
    // beyond dirty-up: own closure to 10 NM, then approach speed
    expect(timeToBall(17.5, 235, 125)).toBeCloseTo((7.5 / 235) * 3600 + (9.25 / 125) * 3600, 6);
    expect(timeToBall(0.5, 125, 125)).toBe(0);
  });

  it('turns 180° in under about a minute and a half at approach speeds', () => {
    expect(turnS(150)).toBeGreaterThan(40);
    expect(turnS(150)).toBeLessThan(90);
  });
});

describe('bolter slot window', () => {
  // the mocked scenario: bolter at 2.5 NM opening at 165, final at 125, 75 s turn;
  // 205 on a 6 NM final, 203 at 17.5 NM at 235 kt
  const T205 = ((6 - 0.75) / 125) * 3600;
  const T203 = (7.5 / 235) * 3600 + ((10 - 0.75) / 125) * 3600;
  const r = slotWindow({ r0: 2.5, vDw: 165, tTurn: 75, vFinal: 125 }, [
    { id: '205', t: T205 },
    { id: '203', t: T203 },
  ]);

  it('finds the turn-in window that keeps 60 s to both neighbours', () => {
    expect(r.window).not.toBeNull();
    const [lo, hi] = r.window!;
    expect(r.tBall(lo) - T205).toBeCloseTo(60, 6);
    expect(T203 - r.tBall(hi)).toBeCloseTo(60, 6);
    expect(lo).toBeGreaterThan(2.5);
    expect(hi).toBeGreaterThan(lo);
  });

  it('classifies the options by interval', () => {
    const now = r.options.find((o) => o.key === 'NOW')!;
    expect(now.cls).not.toBe('ok');
    const fits = r.options.filter((o) => o.x >= r.window![0] && o.x <= r.window![1]);
    expect(fits.every((o) => o.cls === 'ok')).toBe(true);
    expect(r.options.every((o) => (o.cls === 'ok') === (o.gapAhead >= 60 && o.gapBehind >= 60))).toBe(true);
  });

  it('with no traffic the bolter can turn now', () => {
    const free = slotWindow({ r0: 2.5, vDw: 165, tTurn: 75, vFinal: 125 }, []);
    expect(free.window![0]).toBeCloseTo(2.5, 6);
    expect(free.options[0].cls).toBe('ok');
  });

  it('the roll-out is later by the ship opening during the turn; options can be keyed turn-in points', () => {
    const still = slotWindow({ r0: 2.5, vDw: 165, tTurn: 75, vFinal: 125 }, []);
    const moving = slotWindow({ r0: 2.5, vDw: 165, tTurn: 75, vFinal: 125, drift: 0.5 }, [], { options: [{ key: '4 DME', x: 3.8 }] });
    expect(moving.tBall(4) - still.tBall(4)).toBeCloseTo((0.5 / 125) * 3600, 6);
    expect(moving.options.map((o) => o.key)).toEqual(['NOW', '4 DME']);
    expect(moving.options[1].x).toBe(3.8);
  });

  it('a gap too small to fit is skipped for the next one', () => {
    // the earliest the bolter can be at ¾ NM is ~125 s: too soon behind A (150 s); A and B are
    // 90 s apart (a slot needs 120 s), so the window opens 60 s behind B
    const tight = slotWindow({ r0: 2.5, vDw: 165, tTurn: 75, vFinal: 125 }, [
      { id: 'A', t: 150 },
      { id: 'B', t: 240 },
    ]);
    expect(tight.window).not.toBeNull();
    expect(tight.tBall(tight.window![0])).toBeCloseTo(300, 6);
  });
});
