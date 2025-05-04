export enum SupportRoleType {
  CARRIER_AIR_OPS = 'Carrier Air Ops',
  GCI = 'GCI', // Ground Control Intercept
  AWACS = 'AWACS', // Airborne Warning and Control System
  TANKER_CONTROL = 'Tanker Control',
  CUSTOM = 'Custom'
}

export interface CarrierAirOpsRole {
  type: SupportRoleType.CARRIER_AIR_OPS;
  carrierId: string;
  name: string; // Carrier name
  hull: string; // Hull number (e.g., CVN-73)
  callsign: string; // Carrier callsign (e.g., "Warfighter")
  positions: Array<{
    name: string;
    id: string;
  }>;
}

export interface CustomSupportRole {
  type: SupportRoleType.CUSTOM;
  callsign: string;
  positions: Array<{
    name: string;
    id: string;
  }>;
}

export type SupportRole = CarrierAirOpsRole | CustomSupportRole;

// Default positions for carrier air ops
export const DEFAULT_CARRIER_POSITIONS = [
  { name: 'AIR BOSS', id: 'airboss' },
  { name: 'MINI BOSS', id: 'miniboss' },
  { name: 'MARSHALL', id: 'marshall' },
  { name: 'PADDLES', id: 'paddles' }
];
