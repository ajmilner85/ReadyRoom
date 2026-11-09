/**
 * Air-search radar donors (ships and airborne early warning) and their coverage.
 *
 * Detection ranges are open-source figures for a fighter-sized target (about 5 m²), not instrumented
 * maximums. Coverage against a target at a given altitude is the lesser of that range and the radar
 * horizon for the antenna and target heights. Terrain masking is not modelled.
 */

export interface RadarSpec {
  /** radar designation, e.g. "AN/SPY-1D" */
  radar: string;
  /** detection range against a fighter-sized target, NM */
  rangeNm: number;
  /** antenna height above the waterline, ft (ships; airborne radars use the aircraft's altitude) */
  antennaFt?: number;
  kind: 'ship' | 'aew';
  /** ship class shown on the scope, e.g. "DDG" */
  cls?: string;
}

/** Matched against the DCS type name, first match wins. Ships without an air-search radar are absent. */
const RADARS: [RegExp, RadarSpec][] = [
  // airborne early warning
  [/^E-2/i, { radar: 'AN/APS-145', rangeNm: 200, kind: 'aew' }],
  [/^E-3/i, { radar: 'AN/APY-2', rangeNm: 215, kind: 'aew' }],
  [/^A-50/i, { radar: 'Shmel', rangeNm: 125, kind: 'aew' }],
  [/^KJ-2000/i, { radar: 'KJ-2000 AESA', rangeNm: 160, kind: 'aew' }],
  // US / NATO ships
  [/^(CVN_7[1-5]|Stennis|VINSON|CV_59|Forrestal)/i, { radar: 'AN/SPS-48E', rangeNm: 160, antennaFt: 140, kind: 'ship', cls: 'CVN' }],
  [/^LHA_Tarawa/i, { radar: 'AN/SPS-48E', rangeNm: 160, antennaFt: 120, kind: 'ship', cls: 'LHA' }],
  [/^TICONDEROG/i, { radar: 'AN/SPY-1B', rangeNm: 175, antennaFt: 80, kind: 'ship', cls: 'CG' }],
  [/^USS_Arleigh_Burke/i, { radar: 'AN/SPY-1D', rangeNm: 175, antennaFt: 70, kind: 'ship', cls: 'DDG' }],
  [/^PERRY/i, { radar: 'AN/SPS-49', rangeNm: 130, antennaFt: 95, kind: 'ship', cls: 'FFG' }],
  // Russian / Chinese ships
  [/^(KUZNECOW|CV_1143_5)/i, { radar: 'Fregat-MA', rangeNm: 125, antennaFt: 140, kind: 'ship', cls: 'CV' }],
  [/^(MOSCOW|PIOTR)/i, { radar: 'MR-800 Voskhod', rangeNm: 150, antennaFt: 115, kind: 'ship', cls: 'CG' }],
  [/^(NEUSTRASH|REZKY|ALBATROS|MOLNIYA|BDK-775|ELNYA)/i, { radar: 'Positiv / Fregat', rangeNm: 70, antennaFt: 65, kind: 'ship', cls: 'FFG' }],
  [/^Type_052C/i, { radar: 'Type 346', rangeNm: 175, antennaFt: 70, kind: 'ship', cls: 'DDG' }],
  [/^Type_052B/i, { radar: 'Type 382', rangeNm: 125, antennaFt: 75, kind: 'ship', cls: 'DDG' }],
  [/^Type_054A/i, { radar: 'Type 382', rangeNm: 125, antennaFt: 70, kind: 'ship', cls: 'FFG' }],
  [/^Type_071/i, { radar: 'Type 364', rangeNm: 80, antennaFt: 80, kind: 'ship', cls: 'LPD' }],
];

export const radarOf = (type: string | undefined): RadarSpec | undefined => (type ? RADARS.find(([re]) => re.test(type))?.[1] : undefined);

/** Radar horizon (4/3 earth, standard refraction) between two heights in feet, NM. */
export const horizonNm = (aFt: number, bFt: number): number => 1.23 * (Math.sqrt(Math.max(0, aFt)) + Math.sqrt(Math.max(0, bFt)));

/**
 * Coverage radius against a target at `targetFt`: detection range capped by the radar horizon.
 * `radarFt` is the antenna height (ship) or the aircraft's altitude (AEW).
 */
export const coverageNm = (spec: RadarSpec, radarFt: number, targetFt: number): number => Math.min(spec.rangeNm, horizonNm(radarFt, targetFt));

/** Antenna height for a donor: the mast for a ship, the aircraft's altitude for AEW. */
export const antennaFtOf = (spec: RadarSpec, altFt: number): number => (spec.kind === 'aew' ? Math.max(0, altFt) : (spec.antennaFt ?? 60));

/** Target altitudes offered for the blind-spot picture, ft. */
export const BLIND_ALTS = [100, 500, 1000, 5000, 10000, 25000];
