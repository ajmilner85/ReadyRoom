import { SupportRoleType } from './SupportRoleTypes';

export interface AddSupportRoleDialogData {
  type: SupportRoleType.CARRIER_AIR_OPS; // Only support Carrier Air Ops for now
  hull: string;
  name: string;
  carrierId: string;
  // Removed 'callsign' and 'positions' as they are derived or fixed
}

// ... other dialog types ...
