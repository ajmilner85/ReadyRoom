/**
 * CATCC Tacview ingest CLI: prints the track picture around a carrier.
 *
 *   node catcc-server/cli.ts --live dcs.fightingstingrays.com[:42674] [--focus CVN-72]
 *   node catcc-server/cli.ts --replay <file.acmi> [--speed 20] [--from 1800] [--until 2400] [--focus CVN-71]
 *   node catcc-server/cli.ts --replay <file.acmi> --speed 0 --summary     (parse all, print final picture)
 *   node catcc-server/cli.ts --hook dcs.fightingstingrays.com[:10310] --token <token>   (CATCC DCS hook; shows fuel)
 *   node catcc-server/cli.ts --serve <file.acmi> [--port 42675] [--speed 1] [--from 1800]
 *       (fake Tacview real-time server for development; connect with --live localhost:42675)
 */
import { AcmiLineParser } from '../src/catcc/core/acmi/parser.ts';
import { bearingDeg, distanceNm } from '../src/catcc/core/geo.ts';
import { TrackStore, type Track } from '../src/catcc/core/tracks/trackStore.ts';
import { HookTrackStore } from '../src/catcc/core/dcs/hookTrackStore.ts';
import { HookClient } from './dcs/hookClient.ts';
import { TacviewRealtimeClient } from './tacview/realtimeClient.ts';
import { serveAcmi } from './tacview/fakeServer.ts';
import { readAcmiFile, replayAcmi } from './tacview/replay.ts';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const flag = (name: string): boolean => args.includes(`--${name}`);

const store = new TrackStore();
const hookStore = new HookTrackStore();
interface Picture {
  tracks: Map<string, Track>;
  readonly t: number;
  readonly utc: Date | undefined;
}
let view: Picture = store;
const carriers = () => [...view.tracks.values()].filter((t) => t.kind === 'carrier');
const focusHull = opt('focus');
const rangeNm = Number(opt('range') ?? 60);
const everyS = Number(opt('every') ?? 5);

const f = (n: number | undefined, w: number, d = 0): string => (n === undefined || !Number.isFinite(n) ? '-' : n.toFixed(d)).padStart(w);
const pad3 = (n: number) => String(Math.round(n) % 360).padStart(3, '0');

function focusCarrier(): Track | undefined {
  const cvs = carriers().sort((a, b) => (a.hull ?? '').localeCompare(b.hull ?? ''));
  return (focusHull && cvs.find((c) => c.hull === focusHull)) || cvs[0];
}

function render(): string {
  const out: string[] = [];
  const utc = view.utc?.toISOString().slice(11, 19) ?? '--:--:--';
  const air = [...view.tracks.values()].filter((t) => t.kind === 'fixedwing' || t.kind === 'rotary');
  out.push(`SIM ${utc}Z  t=${view.t.toFixed(0)}s  tracks=${view.tracks.size}  air=${air.length}`);
  out.push('CARRIERS  hull     side  hdg  crs    gs  lat/lon');
  for (const c of carriers()) {
    out.push(`          ${(c.hull ?? c.type).padEnd(8)} ${c.side.padEnd(5)} ${pad3(c.headingDeg ?? 0)}  ${c.courseDeg === undefined ? '---' : pad3(c.courseDeg)} ${f(c.gsKt, 5, 1)}  ${c.lat.toFixed(4)} ${c.lon.toFixed(4)}`);
  }
  const cv = focusCarrier();
  if (!cv) return out.join('\n');
  const near = air
    .map((t) => ({ t, rng: distanceNm(cv.lat, cv.lon, t.lat, t.lon), brg: bearingDeg(cv.lat, cv.lon, t.lat, t.lon) }))
    .filter((x) => x.rng <= rangeNm)
    .sort((a, b) => a.rng - b.rng);
  out.push(`AIR within ${rangeNm} NM of ${cv.hull}   (BRA from ship; ALT hundreds ft)`);
  out.push('  board callsign     type             group        BRG   RNG   ALT  HDG    GS    VS  FUEL');
  for (const { t, rng, brg } of near) {
    out.push(
      `  ${(t.board ?? '').padEnd(5)} ${(t.callsign ?? t.pilot ?? t.id).slice(0, 12).padEnd(12)} ${t.type.slice(0, 16).padEnd(16)} ${(t.group ?? '').slice(0, 12).padEnd(12)} ${pad3(brg)} ${f(rng, 5, 1)} ${f(t.altFt / 100, 5)}  ${t.headingDeg === undefined ? '---' : pad3(t.headingDeg)} ${f(t.gsKt, 5)} ${f(t.vsFpm, 5)} ${t.fuelLb !== undefined ? f(t.fuelLb / 1000, 5, 1) : t.fuelFrac !== undefined ? `${f(t.fuelFrac * 100, 3)}%` : '    -'}`,
    );
  }
  return out.join('\n');
}

async function main() {
  const live = opt('live');
  const file = opt('replay');
  const serve = opt('serve');
  const hook = opt('hook');
  if (hook) {
    const token = opt('token') ?? process.env.CATCC_HOOK_TOKEN;
    if (!token) throw new Error('--hook needs --token or CATCC_HOOK_TOKEN');
    const [host, port] = hook.split(':');
    view = hookStore;
    const client = new HookClient({
      host,
      port: port ? Number(port) : undefined,
      token,
      onFrame: (fr) => hookStore.applyFrame(fr),
      onStatus: (st) => console.log(`[hook] ${JSON.stringify(st)}`),
    });
    client.start();
    setInterval(() => console.log(`
[hook ${(client.status.bytesIn / 1e6).toFixed(2)} MB]
` + render()), everyS * 1000);
    return;
  }
  if (serve) {
    const port = Number(opt('port') ?? 42675);
    serveAcmi(readAcmiFile(serve), { port, speed: Number(opt('speed') ?? 1), from: Number(opt('from') ?? 0) });
    console.log(`serving ${serve} as Tacview real-time on :${port}`);
    return;
  }
  if (!live && !file) {
    console.error('usage: --live host[:port] | --replay file.acmi  [--focus CVN-72] [--speed N] [--from S] [--until S] [--summary]');
    process.exit(2);
  }

  if (file) {
    const t0 = Date.now();
    const text = readAcmiFile(file);
    console.log(`loaded ${(text.length / 1e6).toFixed(1)} MB in ${Date.now() - t0} ms`);
    const speed = Number(opt('speed') ?? 10);
    const timer = flag('summary') ? undefined : setInterval(() => console.log('\n' + render()), everyS * 1000);
    const t1 = Date.now();
    await replayAcmi(text, (ev) => store.apply(ev), {
      speed,
      from: opt('from') ? Number(opt('from')) : undefined,
      until: opt('until') ? Number(opt('until')) : undefined,
    });
    clearInterval(timer);
    console.log(`\nreplayed to t=${store.t.toFixed(0)}s in ${Date.now() - t1} ms`);
    console.log(render());
    return;
  }

  const [host, port] = live!.split(':');
  const parser = new AcmiLineParser((ev) => store.apply(ev));
  let lastBytes = 0;
  const client = new TacviewRealtimeClient({
    host,
    port: port ? Number(port) : undefined,
    clientName: 'CATCC-cli',
    onConnect: (name) => {
      store.reset();
      console.log(`connected to ${name}`);
    },
    onText: (text) => parser.push(text),
    onDisconnect: (why) => console.log(`disconnected (${why}); retrying`),
  });
  client.start();
  setInterval(() => {
    const rate = (client.bytesIn - lastBytes) / everyS;
    lastBytes = client.bytesIn;
    console.log(`\n[feed ${(rate / 1024).toFixed(1)} KB/s, total ${(client.bytesIn / 1e6).toFixed(2)} MB]\n` + render());
  }, everyS * 1000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
