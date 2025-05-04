import { SupportRoleType } from './SupportRoleTypes';

export interface AddSupportRoleDialogData {
  type: SupportRoleType;
  callsign: string;
  carrierId?: string;
  positions?: Array<{ name: string; id: string }>;
}
