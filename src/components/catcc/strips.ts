/** Flight strips (D02.1 via FlightCard) from radar formations: shared by the radar's strip bay and PriFly's boards. */
import type { Flight, FlightMember } from '../../types/FlightData';
import { norm360 } from '../../catcc/core/geo.ts';
import type { Formation } from './scopeModel.ts';

const r3 = (n: number) => String(Math.round(norm360(n)) % 360).padStart(3, '0');
const elementOf = (cs?: string) => /-(\d+)$/.exec(cs ?? '')?.[1] ?? '';
export function flightOf(f: Formation): Flight {
  const lead = f.lead;
  const [name, num] = (lead.fl ?? f.group).split(/\s+(?=\d+$)/);
  const members: FlightMember[] = [...f.members]
    .sort((a, b) => Number(elementOf(a.cs) || 99) - Number(elementOf(b.cs) || 99))
    .map((m) => ({
      dashNumber: elementOf(m.cs) || m.id,
      boardNumber: m.bd ?? '---',
      fuel: (m.lb !== undefined ? Math.round(m.lb / 100) / 10 : undefined) as number,
      pilotCallsign: m.pl ?? m.pi ?? '',
    }));
  const fuels = members.map((m) => m.fuel).filter((x) => typeof x === 'number');
  return {
    id: f.id,
    callsign: (name ?? f.group).toUpperCase(),
    flightNumber: num ?? '',
    members,
    position: { bearing: r3(lead.brg), distance: String(Math.round(lead.rng)), altitude: String(Math.round(lead.alt)) },
    lowState: fuels.length ? Math.min(...fuels) : NaN,
    currentSection: '',
    currentDivision: 0,
    formation: members.length === 1 ? 'single' : 'group',
    aircraftType: lead.ty,
  } as Flight;
}
