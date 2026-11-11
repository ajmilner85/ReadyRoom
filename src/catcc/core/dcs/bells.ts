/**
 * Engine-order bells as the Supercarrier's Air Boss ship navigation panel has them
 * (Mods/tech/Supercarrier/AirBossScreensUI/ShipNavigation.lua): DCS's bell ids 1..9 and the speed
 * each settles at. Astern speeds were measured in DCS (BACK 1/3 3 kt, 2/3 6 kt, FULL 9 kt); the
 * ahead speeds are nominal until measured.
 */
export interface Bell {
  name: string;
  /** DCS's bell id for orderShipSpeed() */
  id: number;
  /** speed through the water, kt (negative astern) */
  kt: number;
}

export const BELLS: Bell[] = [
  { name: 'AHEAD FLANK', id: 9, kt: 30 },
  { name: 'AHEAD FULL', id: 8, kt: 22 },
  { name: 'AHEAD STANDARD', id: 7, kt: 15 },
  { name: 'AHEAD 2/3', id: 6, kt: 10 },
  { name: 'AHEAD 1/3', id: 5, kt: 5 },
  { name: 'STOP', id: 4, kt: 0 },
  { name: 'BACK 1/3', id: 3, kt: -3 },
  { name: 'BACK 2/3', id: 2, kt: -6 },
  { name: 'BACK FULL', id: 1, kt: -9 },
];

/** fastest astern, kt (BACK FULL) */
export const MAX_ASTERN_KT = -9;

/** The bell nearest an ordered speed. */
export const bellFor = (kt: number): Bell => BELLS.reduce((a, b) => (Math.abs(b.kt - kt) < Math.abs(a.kt - kt) ? b : a));

/** Ship types with an Air Boss station (Supercarrier entry.lua unlock_player_interaction). */
const AIR_BOSS_RE = /^(CVN_7[1-5]|Stennis|CV_1143_5|USS_Arleigh_Burke_IIa)$/;
export const hasAirBoss = (type: string | undefined): boolean => !!type && AIR_BOSS_RE.test(type);
