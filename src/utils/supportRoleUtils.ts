import { STORAGE_KEYS, saveToLocalStorage, loadFromLocalStorage } from './localStorageUtils';

// Define type for support roles
export interface SupportRole {
  id: string;
  callsign: string;
  pilots: Array<{
    boardNumber: string;
    callsign: string;
    dashNumber: string;
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
  }>;
  creationOrder: number;
  carrier?: {
    hull?: string;
    name?: string;
    carrierId?: string;
  };
  slots?: Array<{
    type: string;
    name: string;
    id: string;
  }>;
}

/**
 * Save support roles to localStorage
 */
export const saveSupportRoles = (roles: SupportRole[]): void => {
  saveToLocalStorage(STORAGE_KEYS.SUPPORT_ROLES, roles);
};

/**
 * Load support roles from localStorage
 */
export const loadSupportRoles = (): SupportRole[] => {
  return loadFromLocalStorage<SupportRole[]>(STORAGE_KEYS.SUPPORT_ROLES, []);
};

/**
 * Ensure support roles exist in assignedPilots even if they're empty
 * This is crucial for preserving support roles when no pilots are assigned
 */
export const ensureSupportRolesInAssignedPilots = (
  supportRoles: SupportRole[],
  assignedPilots: Record<string, any[]>
): Record<string, any[]> => {
  if (!supportRoles || supportRoles.length === 0) {
    return assignedPilots;
  }

  const updatedAssignedPilots = { ...assignedPilots };

  // Ensure each support role exists in assignedPilots with at least empty slots
  supportRoles.forEach(role => {
    if (!updatedAssignedPilots[role.id] || updatedAssignedPilots[role.id].length === 0) {
      // If the role doesn't exist in assignedPilots, add it with empty pilots
      const isCommandControl = role.id.includes('command-control');
      
      if (isCommandControl) {
        const numSlots = role.slots?.length || 2;
        updatedAssignedPilots[role.id] = Array(numSlots).fill(0).map((_, i) => ({
          boardNumber: "",
          callsign: "",
          dashNumber: (i + 1).toString()
        }));
      } else {
        // For Carrier Air Ops, always use 4 slots
        updatedAssignedPilots[role.id] = [
          { boardNumber: "", callsign: "", dashNumber: "1" },
          { boardNumber: "", callsign: "", dashNumber: "2" },
          { boardNumber: "", callsign: "", dashNumber: "3" },
          { boardNumber: "", callsign: "", dashNumber: "4" }
        ];
      }
    }
  });

  return updatedAssignedPilots;
};
