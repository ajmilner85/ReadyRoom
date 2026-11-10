/**
 * Approximate geographic boxes of the DCS theatres, [south, west, north, east] degrees.
 * Used to infer the theatre when a source does not report one (Tacview replay) and to pick the
 * marine layer data (public/catcc/marine/<Theatre>.json, built by scripts/catcc-marine.mjs).
 */
export const THEATRE_BOXES: Record<string, [number, number, number, number]> = {
  PersianGulf: [22.5, 50.5, 31, 60.5],
  Caucasus: [40.5, 35.5, 46.5, 46],
  Syria: [30.5, 29.5, 38.5, 39.5],
  SinaiMap: [26, 28.5, 33.5, 36.5],
  MarianaIslands: [10.5, 140.5, 22.5, 149.5],
  Falklands: [-58, -72, -46, -50],
  Kola: [64, 20, 72.5, 46],
  TheChannel: [49.5, -1.5, 52.5, 3.5],
  Normandy: [48, -4, 52, 3],
  Iraq: [28.5, 38.5, 37.5, 50.5],
  Nevada: [34.5, -119, 39, -113],
  Afghanistan: [29, 60, 38.5, 72],
};

/** The scope's widest view: 160 NM from the centre to the left and right edges. */
export const MAX_RANGE_NM = 160;

/**
 * The extent of a theatre's marine layer data, [south, west, north, east]: the theatre box plus 200 NM
 * on every side (a view at the widest range reaches ~200 NM from its centre once turned), in whole
 * 2-degree tiles. Keep in step with dataBox() in scripts/catcc-marine.mjs.
 */
export function theatreDataBox([s, w, n, e]: [number, number, number, number]): [number, number, number, number] {
  const PAD_NM = 200;
  const padLat = Math.ceil(PAD_NM / 60 / 2) * 2;
  const padLon = Math.ceil(PAD_NM / (60 * Math.cos((Math.max(Math.abs(s), Math.abs(n)) * Math.PI) / 180)) / 2) * 2;
  return [Math.max(-88, s - padLat), w - padLon, Math.min(88, n + padLat), e + padLon];
}

export function theatreAt(lat: number, lon: number): string | undefined {
  for (const [k, [s, w, n, e]] of Object.entries(THEATRE_BOXES)) if (lat >= s && lat <= n && lon >= w && lon <= e) return k;
  return undefined;
}
