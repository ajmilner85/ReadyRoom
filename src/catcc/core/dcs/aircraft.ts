/**
 * Internal fuel capacity (kg) by DCS type name, from M_fuel_max in the DCS 2.9 install
 * (CoreMods/aircraft/..., CoreMods/tech/HeavyMetalCore/...). Unit.getFuel() returns a fraction
 * of this, so fuel in lb = fraction × kg × 2.20462. Types not listed show percent only.
 */
export const INTERNAL_FUEL_KG: Record<string, number> = {
  'FA-18C_hornet': 4900,
  'FA-18A': 4930,
  'F-14B': 7348,
  'F-14A-135-GR': 7348, // F-14A entry inherits the F-14B fuel definition
  'AV8BNA': 3519.423,
  'S-3B': 5962,
  'S-3B Tanker': 6887,
  'KC135MPRS': 90700,
  'KC130': 30000,
  'F-16C_50': 3249,
  'F-15ESE': 10245.53,
  'F-4E-45MC': 5510.5,
  'A-10C_2': 5029,
  'A-10C': 5029,
  'M-2000C': 3165,
  'F-5E-3': 2046,
};

export const LB_PER_KG = 2.20462;

/** Fuel in pounds, or undefined when the type's capacity is unknown. */
export function fuelLb(type: string, fraction: number | undefined): number | undefined {
  const kg = INTERNAL_FUEL_KG[type];
  if (kg === undefined || fraction === undefined || !Number.isFinite(fraction)) return undefined;
  return fraction * kg * LB_PER_KG;
}

/**
 * Theatre time zones (hours from UTC) as DCS applies them to mission local time.
 * DCS uses a fixed offset per map (no DST). Unknown maps return undefined.
 */
export const THEATRE_UTC_OFFSET_H: Record<string, number> = {
  Caucasus: 4,
  PersianGulf: 4,
  Nevada: -8,
  Normandy: 0,
  TheChannel: 0,
  Syria: 3,
  MarianaIslands: 10,
  Falklands: -3,
  SinaiMap: 2,
  Kola: 3,
  Afghanistan: 4.5,
  Iraq: 3,
  GermanyCW: 1,
};
