/**
 * Ship class names for the scope. DCS type names are terse and inconsistent ("TICONDEROG",
 * "USS_Arleigh_Burke_IIa", "PERRY", "MOSCOW"), so known types map to a class label; anything else
 * uses the DCS unit database's display name (sent by the hook), else a cleaned-up type name.
 */
const CLASSES: [RegExp, string][] = [
  [/^TICONDEROG/i, 'CG TICONDEROGA'],
  [/^USS_Arleigh_Burke/i, 'DDG ARLEIGH BURKE'],
  [/^PERRY/i, 'FFG O.H. PERRY'],
  [/^LHA_Tarawa/i, 'LHA TARAWA'],
  [/^(KUZNECOW|CV_1143_5)/i, 'CV KUZNETSOV'],
  [/^MOSCOW/i, 'CG SLAVA'],
  [/^PIOTR/i, 'CGN KIROV'],
  [/^NEUSTRASH/i, 'FFG NEUSTRASHIMY'],
  [/^REZKY/i, 'FFG KRIVAK II'],
  [/^ALBATROS/i, 'FFL GRISHA V'],
  [/^MOLNIYA/i, 'FSG TARANTUL'],
  [/^ELNYA/i, 'AOR ELNYA'],
  [/^BDK-775/i, 'LST ROPUCHA'],
  [/^Type_052C/i, 'DDG TYPE 052C'],
  [/^Type_052B/i, 'DDG TYPE 052B'],
  [/^Type_054A/i, 'FFG TYPE 054A'],
  [/^Type_071/i, 'LPD TYPE 071'],
  [/^Type_093/i, 'SSN TYPE 093'],
  [/^santafe/i, 'SS SANTA FE'],
  [/^Seawise_Giant/i, 'TANKER'],
  [/^HandyWind/i, 'BULK CARRIER'],
  [/^Ship_Tilde_Supply/i, 'SUPPLY SHIP'],
  [/^(speedboat|ZWEZDNY)/i, 'SMALL CRAFT'],
];

export function shipClassName(type: string, displayName?: string): string {
  const known = CLASSES.find(([re]) => re.test(type))?.[1];
  if (known) return known;
  if (displayName && displayName.trim()) return displayName.trim().toUpperCase();
  return type.replace(/^(USS|HMS|CV|CVN|LHA|DDG|CG|FFG)_/i, '').replace(/_/g, ' ').toUpperCase();
}
