import { describe, expect, it } from 'vitest';
import { AcmiLineParser } from '../../src/catcc/core/acmi/parser.ts';
import { FakeHookServer } from './fakeHook.ts';

describe('replay hook bullseye', () => {
  it('places Tacview bullseye navaids relative to the reference point', () => {
    const f = new FakeHookServer({ port: 0, token: 't' });
    const p = new AcmiLineParser(f.apply);
    p.push(
      [
        'FileType=text/acmi/tacview',
        'FileVersion=2.2',
        '0,ReferenceTime=2006-10-29T05:30:00Z',
        '0,ReferenceLongitude=140',
        '0,ReferenceLatitude=10',
        '40000001,T=4.79|3.48|2000,Type=Navaid+Static+Bullseye,Color=Grey,Coalition=Neutrals',
        '40000002,T=5.2456135|4.1740562|2000|49077.68|75846.18,Type=Navaid+Static+Bullseye,Color=Blue,Coalition=Enemies',
        '#0.15',
        '',
      ].join('\n'),
    );
    const b = f.buildEnv().bulls!;
    expect(b).toHaveLength(1);
    expect(b[0].side).toBe('blue');
    expect(b[0].lat).toBeCloseTo(14.174, 3);
    expect(b[0].lon).toBeCloseTo(145.2456, 3);
  });
});
