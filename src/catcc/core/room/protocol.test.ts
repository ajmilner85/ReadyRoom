import { describe, expect, it } from 'vitest';
import { cleanPlan, cleanReplayCmd } from './protocol.ts';

describe('cleanPlan', () => {
  const base = { deps: [285], stacks: [{ id: 'A', r: 156, base: 6 }] };
  it('keeps the list of switched-off stacks (incl. emergency/helo)', () => {
    expect(cleanPlan({ ...base, off: ['E', 'A'] })).toEqual({ ...base, off: ['E', 'A'] });
    expect(cleanPlan({ ...base, off: [] })).toEqual(base);
  });
  it('rejects malformed off lists', () => {
    expect(cleanPlan({ ...base, off: ['not-an-id'] })).toBeNull();
    expect(cleanPlan({ ...base, off: 'E' })).toBeNull();
  });
});

describe('cleanReplayCmd', () => {
  it('takes the playback commands, skip with 1 .. 3600 s', () => {
    for (const c of ['play', 'pause', 'ff', 'rew', 'restart'] as const) expect(cleanReplayCmd(c, 99)).toEqual({ cmd: c });
    expect(cleanReplayCmd('skip', 60)).toEqual({ cmd: 'skip', s: 60 });
    expect(cleanReplayCmd('skip', 29.6)).toEqual({ cmd: 'skip', s: 30 });
  });
  it('rejects anything else', () => {
    expect(cleanReplayCmd('seek', 10)).toBeNull();
    expect(cleanReplayCmd(undefined, undefined)).toBeNull();
    expect(cleanReplayCmd('skip', undefined)).toBeNull();
    expect(cleanReplayCmd('skip', 0)).toBeNull();
    expect(cleanReplayCmd('skip', 3601)).toBeNull();
    expect(cleanReplayCmd('skip', Number.NaN)).toBeNull();
    expect(cleanReplayCmd('skip', '60')).toBeNull();
  });
});
