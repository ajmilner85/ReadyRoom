import { SupportRoleType } from './SupportRoleTypes';

export interface CommandControlSlot {
  type: 'AWACS' | 'OLYMPUS' | 'GCI' | 'JTAC';
  name: string;
  id: string;
}

export interface AddSupportRoleDialogData {
  type: SupportRoleType;
  hull?: string;
  name?: string;
  carrierId?: string;
  callsign?: string;
  slots?: CommandControlSlot[];
  // Removed 'positions' as they are derived or fixed
}

// ... other dialog types ...
