/**
 * Demo picture for the CATCC kit: a carrier, a few jets, a tanker, a helo and an escort, run through the
 * radar's own buildPicture so the real panels (InfoPanels, DeckPanel, InterceptPanel ...) render as live.
 * Kit only; not mission data.
 */
import type { WireTrack } from '../../../catcc/core/room/protocol.ts';
import type { HandoffCtx, OwnerView } from '../ownership.ts';
import type { RadarDonor } from '../radar/types.ts';
import type { Note } from '../radar/Panels.tsx';
import type { CommsPlanEntry } from '../../../types/CommsTypes';
import { buildPicture, type Trail } from '../scopeModel.ts';

const LAT = 26.1;
const LON = 56.4;
const KT = 0.514444;
/** a position `brg` / `nm` from the carrier */
const at = (brg: number, nm: number) => ({ lat: LAT + (nm * Math.cos((brg * Math.PI) / 180)) / 60, lon: LON + (nm * Math.sin((brg * Math.PI) / 180)) / (60 * Math.cos((LAT * Math.PI) / 180)) });

const cv: WireTrack = { id: 'cv', k: 'carrier', ty: 'CVN_71', sd: 'blue', hull: 'CVN-71', g: 'CSG-1', lat: LAT, lon: LON, alt: 0, hdg: 345, crs: 345, gs: 22, wx: { d0: 340, s0: 7 * KT * 1.9, d2: 320, s2: 15 * KT, d10: 300, s10: 28 * KT, tK: 300.15, qnh: 101250 } };
const ac = (id: string, brg: number, nm: number, o: Partial<WireTrack>): WireTrack => ({ id, k: 'fixedwing', ty: 'FA-18C_hornet', sd: 'blue', ...at(brg, nm), alt: 6000, hdg: 0, crs: 0, gs: 280, ...o });

export const DEMO_TRACKS: WireTrack[] = [
  cv,
  ac('a1', 160, 18, { cs: 'Hawk 2-1', fl: 'Hawk 2', bd: '201', g: 'Hawk 2', alt: 7000, hdg: 330, crs: 330, gs: 250, lb: 6400, vs: -900 }),
  ac('a2', 162, 18.4, { cs: 'Hawk 2-2', fl: 'Hawk 2', bd: '205', g: 'Hawk 2', alt: 7000, hdg: 330, crs: 330, gs: 250, lb: 5900 }),
  ac('a3', 200, 9, { cs: 'Chaos 1-1', fl: 'Chaos 1', bd: '305', g: 'Chaos 1', alt: 1200, hdg: 356, crs: 356, gs: 150, lb: 4100 }),
  ac('t1', 120, 12, { cs: 'Texaco 1-1', fl: 'Texaco 1', bd: '700', g: 'Texaco 1', ty: 'S-3B Tanker', alt: 8000, hdg: 250, crs: 250, gs: 260, lb: 9800 }),
  ac('h1', 30, 3, { cs: 'Angel 1-1', fl: 'Angel 1', g: 'Angel 1', k: 'rotary', ty: 'SH-60B', alt: 300, hdg: 120, crs: 120, gs: 90 }),
  ac('r1', 45, 34, { cs: 'Bandit', g: 'Red 1', sd: 'red', ty: 'MiG-29A', alt: 22000, hdg: 220, crs: 220, gs: 420 }),
  // on final (the final bearing is 336: astern of the ship along 156), on and a little high of the 3.5° glidepath, and one further out behind it
  ac('f1', 156, 2.6, { cs: 'Sting 1-1', fl: 'Sting 1', bd: '401', g: 'Sting 1', alt: 1050, hdg: 336, crs: 336, gs: 140, lb: 5200, vs: -700 }),
  ac('f2', 157.5, 5.2, { cs: 'Sting 2-1', fl: 'Sting 2', bd: '410', g: 'Sting 2', alt: 2100, hdg: 336, crs: 336, gs: 150, lb: 6100, vs: -600 }),
  { id: 's1', k: 'ship', ty: 'TICONDEROG', sd: 'blue', dn: 'CG Ticonderoga', g: 'CSG-1 escort', ...at(300, 4), alt: 0, hdg: 345, crs: 345, gs: 22 },
];

/** 5 trail dots, 6 s apart, back along each aircraft's course */
function history(tracks: WireTrack[], now: number): Map<string, Trail[]> {
  const h = new Map<string, Trail[]>();
  for (const t of tracks) {
    if (t.k === 'carrier' || t.k === 'ship') continue;
    const c = ((t.crs ?? 0) * Math.PI) / 180;
    const out: Trail[] = [];
    for (let i = 6; i >= 0; i--) {
      const nm = ((t.gs ?? 0) * 6 * i) / 3600;
      out.push({ t: now - 6 * i, lat: t.lat - (nm * Math.cos(c)) / 60, lon: t.lon - (nm * Math.sin(c)) / (60 * Math.cos((t.lat * Math.PI) / 180)), alt: t.alt });
    }
    h.set(t.id, out);
  }
  return h;
}

export const DEMO_MT = 3600;
export const DEMO_UTC = new Date(Date.UTC(2026, 5, 14, 15, 22, 7));
export const DEMO_OFFH = 4;
export const demoPicture = () => buildPicture(DEMO_TRACKS, 'CVN-71', history(DEMO_TRACKS, DEMO_MT), DEMO_MT);

export const DEMO_DONORS: RadarDonor[] = [
  { id: 'cv', p: [0, 0], name: 'CVN-71', radar: 'SPS-48E', kind: 'ship', cov: 42, covLow: 18 },
  { id: 's1', p: [-3.5, -2], name: 'CG-47', radar: 'SPY-1', kind: 'ship', cov: 58, covLow: 21 },
] as RadarDonor[];

export const DEMO_NOTES: Note[] = [
  { id: 'n1', k: 'conflict', kind: 'CONFLICT', t: '19:22', title: '201 / 305', body: 'CPA 0.8 NM / 400 FT · 1:12', goTo: [0, 0] },
  { id: 'n2', k: 'handoff', kind: 'HANDOFF', t: '19:21', title: 'Hawk 2 from Marshal', goTo: [0, 0], action: { label: 'Accept', run: () => undefined } },
  { id: 'n3', k: 'warn', kind: 'LOW STATE', t: '19:20', title: 'Chaos 1-1 · 4.1', goTo: [0, 0] },
  { id: 'n4', k: 'coord', kind: 'COORD', t: '19:18', title: 'CVN-74 coordination line set' },
  { id: 'n5', k: 'info', kind: 'INFO', t: '19:15', title: 'Recovery case III' },
];

export const DEMO_PLAN: CommsPlanEntry[] = [
  { chan: '1', name: 'Strike', freq: '251.000', tacan: '', ils: '', kyFill: '' },
  { chan: '2', name: 'Marshal', freq: '264.000', tacan: '', ils: '', kyFill: '1' },
  { chan: '3', name: 'Approach', freq: '255.750', tacan: '', ils: '', kyFill: '' },
  { chan: '4', name: 'Tower', freq: '308.475', tacan: '71X', ils: '13', kyFill: '1' },
];

export const demoHandoff = (): { v: OwnerView; ctx: HandoffCtx } => {
  const me = { carrier: 'CVN-71', role: 'marshal' as const };
  return {
    v: { key: 'Hawk 2', owner: me, explicit: true },
    ctx: { layout: 'expanded', me, seats: [{ ...me, userId: 'kit', name: 'Kit', since: 0 }], userId: 'kit', onHandoff: () => undefined, onAccept: () => undefined },
  };
};
