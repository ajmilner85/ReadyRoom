import { describe, expect, it } from 'vitest';
import { AcmiLineParser } from '../../src/catcc/core/acmi/parser.ts';
import { FakeHookServer } from './fakeHook.ts';
import { HookClient } from './hookClient.ts';
import type { HookEnv } from '../../src/catcc/core/dcs/hookProtocol.ts';

const BULLS_ACMI = [
  'FileType=text/acmi/tacview',
  'FileVersion=2.2',
  '0,ReferenceTime=2006-10-29T05:30:00Z',
  '0,ReferenceLongitude=140',
  '0,ReferenceLatitude=10',
  '40000002,T=5.2456135|4.1740562|2000|49077.68|75846.18,Type=Navaid+Static+Bullseye,Color=Blue,Coalition=Enemies',
  '#0.15',
  '',
].join('\n');

describe('replay hook bullseye', () => {
  it('reaches the room through the hook client (env passes bulls on)', async () => {
    const f = new FakeHookServer({ port: 0, token: 't' });
    new AcmiLineParser(f.apply).push(BULLS_ACMI);
    const port = await f.listen();
    const env = await new Promise<HookEnv>((resolve, reject) => {
      const c = new HookClient({ host: '127.0.0.1', port, token: 't', onFrame: () => undefined, onEnv: (e) => { c.stop(); resolve(e); } });
      setTimeout(() => reject(new Error('no env')), 4000);
      c.start();
    });
    f.close();
    expect(env.bulls?.[0]).toMatchObject({ side: 'blue' });
    expect(env.bulls?.[0].lat).toBeCloseTo(14.174, 3);
  });

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
