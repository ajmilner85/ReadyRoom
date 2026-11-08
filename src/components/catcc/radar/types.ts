/** Radar UI types and display-scale constants (handoff §8). */
export type Tool = 'select' | 'bra' | 'marshal' | 'cpa' | 'vec';
export type Fit = 'r50' | 'cca' | 'dep' | 'app' | null;
export type Highlight = { k: 'dep'; id: number } | { k: 'm'; id: string } | { k: 'e' } | { k: 'h' };
export type Editing = { k: 'dep'; r: number } | { k: 'm'; id: string } | { k: 'coord'; hull: string };
export interface Placement {
  placing: 'dep' | 'm' | 'coord' | null;
  editing: Editing | null;
  hov: number | null;
  /** coordination line being placed on the scope */
  coord?: { hull: string; brg: number; off: number };
}
export interface UiScale {
  h: number;
  t: number;
  l: number;
  o: number;
}
export const UI_STEPS = [1.15, 1.3, 1.45, 1.6, 1.8];
export const LW_STEPS = [1.15, 1.5, 1.9, 2.4, 3];
export const UI_DEF: UiScale = { h: 2, t: 2, l: 2, o: 2 };

/** Conflict alert tuning (handoff §5.4 left the look-ahead open; user asked for it to be configurable). */
export interface ConflictCfg {
  lookAheadS: number;
  vertCapS: number;
  /** realistic radar update rate: hits repaint as the SPN-43 sweep passes (radar/sweep.ts) */
  sweep: boolean;
  /** ship datalink: other friendly carriers and CSG escorts with air-search radars also paint hits */
  datalink: boolean;
}
export const CONFLICT_DEF: ConflictCfg = { lookAheadS: 120, vertCapS: 30, sweep: false, datalink: false };

export const LAYER_GROUPS: [string, [string, string, string][]][] = [
  ['Ship', [['brc', 'BRC', '#E6EDF3'], ['fb', 'Final bearing', '#E6EDF3']]],
  ['Airspace', [['cca', 'CCA 50 NM', '#40A85B'], ['coord', 'Coordination lines', '#3E9BD4'], ['sar', 'Helo restrictions', '#DE9A1F']]],
  ['Departure', [['dep', 'Departure radials', '#93A1B0']]],
  ['Approach', [['marshal', 'Marshal stacks', '#F15822'], ['arr', 'Arrival paths', '#93A1B0'], ['cv1', 'CV-1 approach', '#E6EDF3'], ['cv2', 'CV-2 approach', '#C9D3DD'], ['cv3', 'CV-3 approach (helo)', '#C9D3DD']]],
  ['Recovery', [['bolter', 'Bolter pattern', '#DE9A1F'], ['tanker', 'Tanker pattern', '#93A1B0']]],
  ['Marine', [['coast', 'Coastline', '#A9B4A0'], ['bathy', 'Bathymetry (m)', '#4F86B8']]],
  ['Geography', [['places', 'Place names', '#8E99A6'], ['airports', 'Airports / airbases', '#C8B07A'], ['terr', '12 NM territorial limit', '#B48AD9']]],
  ['Reference', [['rings', 'Range rings / compass', '#5E9A6C'], ['sweep', 'Radar sweep', '#5E9A6C'], ['bulls', 'Bullseye', '#6FB6E6'], ['latlon', 'Lat / lon marks', '#93A1B0'], ['grid', 'Lat / lon grid', '#93A1B0']]],
];
export const OV_DEFAULT = { terr: false, bulls: true, sweep: false, places: true, airports: true, coast: true, bathy: true, cca: true, coord: true, rings: true, latlon: true, grid: false, brc: true, fb: true, marshal: true, arr: true, bolter: false, dep: true, tanker: true, sar: false, cv1: false, cv2: false, cv3: false };
export const OV2_DEFAULT = { cca: true, rings: false, brc: true, fb: true, marshal: true, arr: true, bolter: false, dep: true, tanker: false, sar: false, cv1: false, cv2: false, cv3: false };
