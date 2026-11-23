/**
 * A Tacview recording played back under control: play / pause, 2x-8x forward and backward, restart and
 * skip ahead (the dev replay source's playback controls; see fakeHook.ts and room/main.ts).
 *
 * The recording is parsed once into an event list with keyframes (a TrackStore snapshot every
 * KEYFRAME_S of recording time). A seek restores the last keyframe at least WARMUP_S before the target
 * and plays the events from there up to it, so the picture is exactly what playing forward would have
 * shown: groundspeed, course and vertical speed come from forward-ordered samples, never from
 * differencing a jump. Playing backward is a seek on every tick.
 */
import { AcmiLineParser, type AcmiEvent } from '../../src/catcc/core/acmi/parser.ts';
import type { ReplayCommand, ReplayState } from '../../src/catcc/core/dcs/hookProtocol.ts';
import { MAX_REPLAY_SKIP_S } from '../../src/catcc/core/room/protocol.ts';
import { TrackStore, type TrackStoreSnapshot } from '../../src/catcc/core/tracks/trackStore.ts';

/** recording seconds between keyframes */
export const KEYFRAME_S = 30;
/** recording seconds played before a seek's target (well over the TrackStore's 4 s kinematics window) */
export const WARMUP_S = 10;
export const MAX_RATE = 8;

export interface AcmiIndex {
  events: AcmiEvent[];
  /** first and last frame time (s); 0 when the recording has no frames */
  start: number;
  end: number;
  /** the store after events[0 .. i-1]; t: the last frame time applied (-Infinity before the first) */
  keyframes: { t: number; i: number; snap: TrackStoreSnapshot }[];
}

export function parseAcmi(text: string): AcmiEvent[] {
  const events: AcmiEvent[] = [];
  const parser = new AcmiLineParser((e) => events.push(e));
  parser.push(text);
  parser.end();
  return events;
}

/** Index a recording for seeking: one pass through a scratch TrackStore, snapshotting it every `keyframeS`. */
export function indexAcmi(events: AcmiEvent[], keyframeS = KEYFRAME_S): AcmiIndex {
  const store = new TrackStore();
  const keyframes: AcmiIndex['keyframes'] = [{ t: -Infinity, i: 0, snap: store.snapshot() }];
  let start: number | undefined;
  let end = 0;
  let next: number | undefined;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.kind === 'time') {
      start ??= ev.t;
      end = Math.max(end, ev.t);
      if (next === undefined) next = ev.t + keyframeS;
      else if (ev.t >= next) {
        keyframes.push({ t: store.t, i, snap: store.snapshot() });
        next = ev.t + keyframeS;
      }
    }
    store.apply(ev);
  }
  return { events, start: start ?? 0, end: Math.max(end, start ?? 0), keyframes };
}

export interface ReplayPlayerOptions {
  /** where events go (the fake hook's store, through the demo pattern when it runs) */
  sink: (ev: AcmiEvent) => void;
  /** the store the sink feeds: a seek restores a keyframe into it */
  store: TrackStore;
  /** where the replay starts and restarts (s, clamped to the recording); default its first frame */
  from?: number;
  /** at the end: start again from `from` (default), else pause on the last frame */
  loop?: boolean;
  /** after a keyframe was restored into the store (e.g. the demo pattern forgets its aircraft) */
  onRestore?: () => void;
  /** the clock changed by itself other than by playing on (a loop, the end or the start reached); commands don't call it */
  onChange?: (s: ReplayState) => void;
  /** ms between ticks when started (default 500) */
  tickMs?: number;
  now?: () => number;
}

/** What a command does to the playing / rate pair (the clock itself moves in ReplayPlayer). */
export function nextRate(cmd: ReplayCommand, playing: boolean, rate: number): { playing: boolean; rate: number } {
  switch (cmd) {
    case 'play':
    case 'restart':
      return { playing: true, rate: 1 };
    case 'pause':
      return { playing: false, rate: 1 };
    case 'ff':
      return { playing: true, rate: playing && rate >= 2 ? Math.min(MAX_RATE, rate * 2) : 2 };
    case 'rew':
      return { playing: true, rate: playing && rate <= -2 ? Math.max(-MAX_RATE, rate * 2) : -2 };
    case 'skip':
      return { playing, rate };
  }
}

export class ReplayPlayer {
  playing = true;
  rate = 1;
  /** the replay's clock (recording seconds); the store holds every event up to it */
  clock: number;
  /** where restart goes */
  readonly startAt: number;
  private pos = 0;
  private wallAt: number;
  private timer?: NodeJS.Timeout;
  private readonly index: AcmiIndex;
  private readonly opts: ReplayPlayerOptions;
  private readonly now: () => number;

  constructor(index: AcmiIndex, opts: ReplayPlayerOptions) {
    this.index = index;
    this.opts = opts;
    this.now = opts.now ?? Date.now;
    this.startAt = Math.min(index.end, Math.max(index.start, opts.from ?? index.start));
    this.clock = this.startAt;
    this.wallAt = this.now();
    this.seek(this.startAt, true);
  }

  get state(): ReplayState {
    return { playing: this.playing, rate: this.rate, mt: this.clock, start: this.index.start, end: this.index.end };
  }

  start(): void {
    this.wallAt = this.now();
    this.timer = setInterval(() => this.tick(), this.opts.tickMs ?? 500);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  /** Move the clock on by the wall time since the last tick at the current rate. */
  tick(): void {
    const now = this.now();
    const dt = Math.max(0, (now - this.wallAt) / 1000);
    this.wallAt = now;
    if (!this.playing || dt === 0) return;
    const t = this.clock + dt * this.rate;
    const { start, end } = this.index;
    if (t >= end) {
      if (this.opts.loop ?? true) {
        this.playing = true;
        this.rate = 1;
        this.seekTo(this.startAt, true);
      } else {
        this.seekTo(end);
        this.playing = false;
        this.rate = 1;
      }
      this.changed();
      return;
    }
    if (t <= start) {
      // rewound to the beginning: hold there
      this.seekTo(start);
      this.playing = false;
      this.rate = 1;
      this.changed();
      return;
    }
    this.seekTo(t);
  }

  /** A playback command; null when done, else why not. */
  command(cmd: ReplayCommand, s?: number): string | null {
    if (cmd === 'skip' && !(typeof s === 'number' && Number.isFinite(s) && s >= 1 && s <= MAX_REPLAY_SKIP_S)) return `skip: 1 to ${MAX_REPLAY_SKIP_S} s`;
    this.tick();
    Object.assign(this, nextRate(cmd, this.playing, this.rate));
    if (cmd === 'restart') this.seekTo(this.startAt, true);
    else if (cmd === 'skip') this.seekTo(Math.min(this.index.end, this.clock + s!));
    this.wallAt = this.now();
    return null;
  }

  private changed(): void {
    this.opts.onChange?.(this.state);
  }

  private seekTo(t: number, fresh = false): void {
    this.clock = t;
    this.seek(t, fresh);
  }

  /**
   * Bring the store to recording time t: forward and near, by playing the events in between; else (or
   * `fresh`) from the last keyframe at least WARMUP_S before t.
   */
  private seek(t: number, fresh = false): void {
    const { store } = this.opts;
    if (!fresh && this.pos > 0 && t >= store.t && t - store.t <= KEYFRAME_S + WARMUP_S) {
      this.advance(t);
      return;
    }
    const kfs = this.index.keyframes;
    let k = 0;
    for (let lo = 0, hi = kfs.length - 1; lo <= hi; ) {
      const mid = (lo + hi) >> 1;
      if (kfs[mid].t <= t - WARMUP_S) {
        k = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    store.restore(kfs[k].snap);
    this.pos = kfs[k].i;
    this.opts.onRestore?.();
    this.advance(t);
  }

  /** play the events up to (and including) frame time t */
  private advance(t: number): void {
    const evs = this.index.events;
    while (this.pos < evs.length) {
      const ev = evs[this.pos];
      if (ev.kind === 'time' && ev.t > t) break;
      this.opts.sink(ev);
      this.pos++;
    }
  }
}
