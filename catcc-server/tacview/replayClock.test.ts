import { describe, expect, it } from 'vitest';
import type { AcmiEvent } from '../../src/catcc/core/acmi/parser.ts';
import { destination } from '../../src/catcc/core/geo.ts';
import { TrackStore } from '../../src/catcc/core/tracks/trackStore.ts';
import { withDemoPattern } from '../dcs/demoPattern.ts';
import { indexAcmi, nextRate, parseAcmi, ReplayPlayer } from './replayClock.ts';

const REF = { lat: 26, lon: 56 };

/** A carrier at 20 kt and a Hornet at 400 kt, frames every 0.5 s from 100 s to 700 s; a bullseye placed before the first frame. */
function recording(): AcmiEvent[] {
  const ev: AcmiEvent[] = [
    { kind: 'header', key: 'FileType', value: 'text/acmi/tacview' },
    { kind: 'update', id: '0', props: { ReferenceTime: '2026-11-08T14:00:00Z', ReferenceLatitude: String(REF.lat), ReferenceLongitude: String(REF.lon) } },
    { kind: 'update', id: '40000002', props: { T: '1|1|2000', Type: 'Navaid+Static+Bullseye', Color: 'Blue' } },
  ];
  for (let t = 100; t <= 700; t += 0.5) {
    const cv = destination(26.2, 56.2, 0, (20 * t) / 3600);
    const fa = destination(26.5, 56.0, 90, (400 * t) / 3600);
    const first = t === 100;
    ev.push({ kind: 'time', t });
    ev.push({ kind: 'update', id: 'cv', props: { T: `${cv.lon - REF.lon}|${cv.lat - REF.lat}|20|0|0|0|0|0|0`, ...(first ? { Type: 'Sea+Watercraft+AircraftCarrier', Name: 'CVN_71', Color: 'Blue' } : {}) } });
    ev.push({ kind: 'update', id: 'fa', props: { T: `${fa.lon - REF.lon}|${fa.lat - REF.lat}|3000|0|0|90|0|0|90`, ...(first ? { Type: 'Air+FixedWing', Name: 'FA-18C_hornet', Color: 'Blue', Pilot: 'Volt 3-1 | 401 Ace' } : {}) } });
  }
  return ev;
}

/** the store as playing straight through to t shows it */
function forwardTo(events: AcmiEvent[], t: number): TrackStore {
  const s = new TrackStore();
  for (const e of events) {
    if (e.kind === 'time' && e.t > t) break;
    s.apply(e);
  }
  return s;
}

function rig(from?: number, loop = true) {
  const events = recording();
  const index = indexAcmi(events);
  const store = new TrackStore();
  let now = 0;
  const changes: string[] = [];
  const player = new ReplayPlayer(index, { sink: (e) => store.apply(e), store, from, loop, now: () => now, onChange: (s) => changes.push(`${s.playing ? 'play' : 'pause'} ${s.rate} ${s.mt}`) });
  return { events, index, store, player, changes, wait: (ms: number) => ((now += ms), player.tick()) };
}

describe('replay clock commands', () => {
  it('fast forward and rewind double each press up to 8x; play is 1x; pause holds', () => {
    let st = { playing: true, rate: 1 };
    const seq = (cmd: Parameters<typeof nextRate>[0]) => ((st = nextRate(cmd, st.playing, st.rate)), st.rate);
    expect([seq('ff'), seq('ff'), seq('ff'), seq('ff')]).toEqual([2, 4, 8, 8]);
    expect(seq('play')).toBe(1);
    expect([seq('rew'), seq('rew'), seq('rew'), seq('rew')]).toEqual([-2, -4, -8, -8]);
    // switching direction starts again at 2x
    expect(seq('ff')).toBe(2);
    expect(seq('rew')).toBe(-2);
    expect(nextRate('pause', true, -4)).toEqual({ playing: false, rate: 1 });
    // from pause, fast forward plays at 2x
    expect(nextRate('ff', false, 1)).toEqual({ playing: true, rate: 2 });
    expect(nextRate('skip', false, 1)).toEqual({ playing: false, rate: 1 });
  });

  it('indexes the recording: start, end, keyframes every 30 s', () => {
    const { index } = rig();
    expect(index.start).toBe(100);
    expect(index.end).toBe(700);
    // the empty store, then one at each 30 s of recording
    expect(index.keyframes.length).toBe(1 + 20);
    expect(index.keyframes[1].t).toBeCloseTo(129.5, 5);
  });

  it('parses text recordings', () => {
    const ev = parseAcmi('FileType=text/acmi/tacview\n#1.5\n2,T=1|2|3,Type=Air+FixedWing\n-2\n');
    expect(ev.map((e) => e.kind)).toEqual(['header', 'time', 'update', 'remove']);
  });
});

describe('replay player', () => {
  it('starts at --from and plays at 1x', () => {
    const r = rig(300);
    expect(r.player.state).toMatchObject({ playing: true, rate: 1, mt: 300, start: 100, end: 700 });
    expect(r.store.t).toBe(300);
    r.wait(2000);
    expect(r.store.t).toBe(302);
    expect(r.store.tracks.get('fa')!.gsKt).toBeCloseTo(400, -1);
  });

  it('rewinds with the picture of playing forward: same positions, sane groundspeeds', () => {
    const r = rig(400);
    r.player.command('rew');
    r.player.command('rew');
    r.player.command('rew');
    expect(r.player.rate).toBe(-8);
    for (let i = 0; i < 20; i++) {
      r.wait(500);
      const fa = r.store.tracks.get('fa')!;
      // each tick is a seek: no teleport, no derived speed from going backwards
      expect(fa.gsKt).toBeGreaterThan(380);
      expect(fa.gsKt).toBeLessThan(420);
      expect(fa.courseDeg).toBeCloseTo(90, -1);
      const ref = forwardTo(r.events, r.player.clock).tracks.get('fa')!;
      expect(fa.lat).toBeCloseTo(ref.lat, 9);
      expect(fa.lon).toBeCloseTo(ref.lon, 9);
    }
    expect(r.player.clock).toBe(400 - 80);
  });

  it('holds at the start when rewound to it', () => {
    const r = rig(120);
    r.player.command('rew');
    r.wait(15_000);
    expect(r.player.state).toMatchObject({ playing: false, rate: 1, mt: 100 });
    expect(r.changes).toEqual(['pause 1 100']);
    r.player.command('play');
    r.wait(1000);
    expect(r.player.clock).toBe(101);
  });

  it('pauses, fast forwards and skips ahead', () => {
    const r = rig(200);
    r.player.command('pause');
    r.wait(5000);
    expect(r.player.clock).toBe(200);
    r.player.command('ff');
    r.player.command('ff');
    r.wait(1000);
    expect(r.player.clock).toBe(204);
    r.player.command('skip', 120);
    expect(r.player.clock).toBe(324);
    expect(r.store.t).toBe(324);
    // still at 4x after the skip
    expect(r.player.rate).toBe(4);
    expect(r.store.tracks.get('fa')!.gsKt).toBeCloseTo(400, -1);
    expect(r.player.command('skip', 0)).toMatch(/skip/);
    expect(r.player.command('skip', 4000)).toMatch(/skip/);
    // a skip past the end lands on the last frame
    r.player.command('skip', 3600);
    expect(r.player.clock).toBe(700);
  });

  it('restarts at --from at 1x, and loops there at the end', () => {
    const r = rig(250);
    r.player.command('skip', 400);
    expect(r.player.clock).toBe(650);
    r.player.command('ff');
    r.player.command('restart');
    expect(r.player.state).toMatchObject({ playing: true, rate: 1, mt: 250 });
    expect(r.store.t).toBe(250);
    r.player.command('skip', 445);
    r.wait(10_000);
    expect(r.player.state).toMatchObject({ playing: true, rate: 1, mt: 250 });
    expect(r.changes).toEqual(['play 1 250']);
  });

  it('stops on the last frame without loop', () => {
    const r = rig(690, false);
    r.wait(20_000);
    expect(r.player.state).toMatchObject({ playing: false, mt: 700 });
  });

  it('keeps objects placed before the keyframe it seeks from (the bullseye)', () => {
    const r = rig(600);
    expect(r.store.acmi.objects.get('40000002')?.transform.lat).toBe(27);
    expect(r.store.acmi.refLat).toBe(26);
    expect(r.store.utc?.toISOString()).toBe('2026-11-08T14:10:00.000Z');
  });

  it('leaves the keyframes untouched by later playback', () => {
    const r = rig(100);
    const kf = r.index.keyframes[5];
    const before = JSON.stringify(kf.snap);
    r.player.command('skip', 200);
    r.wait(3000);
    r.player.command('rew');
    r.wait(3000);
    expect(JSON.stringify(kf.snap)).toBe(before);
  });

  it('places the demo pattern where it would have been after a seek, without teleport speeds', () => {
    const events = recording();
    const index = indexAcmi(events);
    const store = new TrackStore();
    const demo = withDemoPattern((e) => store.apply(e), store);
    let now = 0;
    const player = new ReplayPlayer(index, { sink: demo, store, from: 300, now: () => now, onRestore: () => demo.reset() });
    const demoIds = () => [...store.tracks.keys()].filter((id) => id.startsWith('d')).sort();
    const at300 = demoIds();
    expect(at300.length).toBeGreaterThan(0);
    player.command('skip', 150);
    player.command('rew');
    player.command('rew');
    for (let i = 0; i < 30; i++) {
      now += 500;
      player.tick();
      for (const id of demoIds()) expect(store.tracks.get(id)!.gsKt ?? 0).toBeLessThan(300);
      // one of each demo at most
      expect(demoIds().length).toBeLessThanOrEqual(3);
    }
    player.command('restart');
    expect(demoIds()).toEqual(at300);
  });
});
