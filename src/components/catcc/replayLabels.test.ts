import { describe, expect, it } from 'vitest';
import { rateLabel, replayTime, skipLabel } from './replayLabels.ts';

describe('replay control labels', () => {
  it('names skip intervals', () => {
    expect([30, 60, 90, 120, 600].map(skipLabel)).toEqual(['30 s', '1 min', '1 min 30 s', '2 min', '10 min']);
  });
  it('shows the recording time as h:mm:ss', () => {
    expect(replayTime(3300.7)).toBe('0:55:00');
    expect(replayTime(5065.72)).toBe('1:24:25');
    expect(replayTime(-3)).toBe('0:00:00');
  });
  it('signs backward rates', () => {
    expect(rateLabel(4)).toBe('4×');
    expect(rateLabel(-2)).toBe('−2×');
  });
});
