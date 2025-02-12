export type TankerType = 'S-3B' | 'KC-135 MPRS' | 'KC-130';
export type TankerRole = 'mission-tankers' | 'recovery-tankers';

export interface TankerDivisionData {
  label: string;
  callsign: string;
  altitude: number;
  aircraftType: TankerType;
  role: TankerRole;
}