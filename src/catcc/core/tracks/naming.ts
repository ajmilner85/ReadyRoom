/**
 * DCS multiplayer pilot strings are free text, e.g.
 *   "Hawk 1-2 | Bueller", "STING 1-3 | 614 Tex", "Sting 1-2 524 ATIS", "Hawk 4-2/733 QUIZNOS"
 * AI units carry the unit name instead ("CSG-1-1", "Naval-6-1").
 * We pull out the flight callsign ("HAWK 1-2"), a 3-digit board number if present, and the
 * remaining player handle. Matching to the roster happens later, by board number.
 */
export interface PilotName {
  callsign?: string;
  /** flight callsign without the element number, e.g. "HAWK 1" */
  flight?: string;
  board?: string;
  player?: string;
}

const CALLSIGN = /^\s*([A-Za-z][A-Za-z ]*?)[\s-]*(\d{1,2})-(\d{1,2})\b/;
const BOARD = /(?:^|[^\d])(\d{3})(?!\d)/;

export function parsePilot(raw: string | undefined): PilotName {
  if (!raw) return {};
  const out: PilotName = {};
  let rest = raw;
  const m = CALLSIGN.exec(raw);
  if (m) {
    const name = m[1].trim().toUpperCase();
    out.flight = `${name} ${m[2]}`;
    out.callsign = `${out.flight}-${m[3]}`;
    rest = raw.slice(m[0].length);
  }
  const b = BOARD.exec(rest);
  if (b) {
    out.board = b[1];
    const at = b.index + b[0].length - 3;
    rest = rest.slice(0, at) + rest.slice(at + 3);
  }
  const player = rest.replace(/^[\s|/:\-–]+|[\s|/:\-–]+$/g, '').replace(/\s{2,}/g, ' ');
  if (player) out.player = player;
  return out;
}

/** Known carriers that CATCC controls, by DCS unit type name. */
export const CARRIER_HULLS: Record<string, { hull: string; name: string; nick: string }> = {
  CVN_71: { hull: 'CVN-71', name: 'THEODORE ROOSEVELT', nick: 'Rough Rider' },
  CVN_72: { hull: 'CVN-72', name: 'ABRAHAM LINCOLN', nick: 'Abe' },
  CVN_73: { hull: 'CVN-73', name: 'GEORGE WASHINGTON', nick: 'Warfighter' },
  Stennis: { hull: 'CVN-74', name: 'JOHN C. STENNIS', nick: 'Johnny Reb' },
  CVN_75: { hull: 'CVN-75', name: 'HARRY S. TRUMAN', nick: 'Lone Warrior' },
  Forrestal: { hull: 'CV-59', name: 'FORRESTAL', nick: 'Forrestal' },
  LHA_Tarawa: { hull: 'LHA-1', name: 'TARAWA', nick: 'Tarawa' },
};

/** Carrier info by hull number ("CVN-72"). */
export const carrierByHull = (hull: string | undefined) => Object.values(CARRIER_HULLS).find((c) => c.hull === hull);
