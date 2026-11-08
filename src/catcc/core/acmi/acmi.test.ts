import { describe, expect, it } from 'vitest';
import { AcmiLineParser, splitProps, type AcmiEvent } from './parser.ts';
import { AcmiState } from './state.ts';

function parseAll(text: string, chunk = 0): AcmiEvent[] {
  const out: AcmiEvent[] = [];
  const p = new AcmiLineParser((e) => out.push(e));
  if (chunk > 0) for (let i = 0; i < text.length; i += chunk) p.push(text.slice(i, i + chunk));
  else p.push(text);
  p.end();
  return out;
}

const SAMPLE = [
  '﻿FileType=text/acmi/tacview',
  'FileVersion=2.2',
  '0,ReferenceTime=2006-10-29T05:32:07Z',
  '0,ReferenceLongitude=140',
  '0,ReferenceLatitude=10',
  '// a comment',
  '#0.27',
  '102,T=5.73|5.22||||51.7|102235.19|191812.88|52,Type=Sea+Watercraft+AircraftCarrier,Name=CVN_72',
  '103,T=5.57|3.35|21.96,Type=Air+FixedWing,Name=FA-18C_hornet,Pilot=Hawk 1-2 \\, Bueller',
  '#1.5',
  '102,T=5.74|5.23|||||||53',
  '0,Event=Message|103|line one\\',
  'line two',
  '-103',
].join('\r\n');

describe('AcmiLineParser', () => {
  it('parses headers, globals, frames, updates, removals', () => {
    const ev = parseAll(SAMPLE);
    expect(ev[0]).toEqual({ kind: 'header', key: 'FileType', value: 'text/acmi/tacview' });
    expect(ev.filter((e) => e.kind === 'time').map((e) => (e as { t: number }).t)).toEqual([0.27, 1.5]);
    expect(ev.at(-1)).toEqual({ kind: 'remove', id: '103' });
    const hornet = ev.find((e) => e.kind === 'update' && e.id === '103') as Extract<AcmiEvent, { kind: 'update' }>;
    expect(hornet.props.Pilot).toBe('Hawk 1-2 , Bueller');
  });

  it('joins backslash-continued lines', () => {
    const ev = parseAll(SAMPLE);
    const msg = ev.find((e) => e.kind === 'update' && e.props.Event) as Extract<AcmiEvent, { kind: 'update' }>;
    expect(msg.props.Event).toBe('Message|103|line one\nline two');
  });

  it('is independent of chunk boundaries', () => {
    expect(parseAll(SAMPLE, 7)).toEqual(parseAll(SAMPLE));
    expect(parseAll(SAMPLE, 1)).toEqual(parseAll(SAMPLE));
  });

  it('splitProps keeps "=" inside values', () => {
    expect(splitProps('A=1,B=x=y')).toEqual({ A: '1', B: 'x=y' });
  });
});

describe('AcmiState', () => {
  it('applies reference offsets and keeps unchanged T components', () => {
    const st = new AcmiState();
    for (const e of parseAll(SAMPLE)) st.apply(e);
    const cv = st.objects.get('102')!;
    expect(cv.transform.lon).toBeCloseTo(145.74, 6);
    expect(cv.transform.lat).toBeCloseTo(15.23, 6);
    expect(cv.transform.yaw).toBe(51.7); // unchanged from first update
    expect(cv.transform.heading).toBe(53);
    expect(st.objects.has('103')).toBe(false);
    expect(st.utc?.toISOString()).toBe('2006-10-29T05:32:08.500Z');
  });
});
