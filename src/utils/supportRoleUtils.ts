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

  let hasChanges = false;
  const updatedAssignedPilots = { ...assignedPilots };

  // Ensure each support role exists in assignedPilots, preserving pilots from the role itself
  supportRoles.forEach(role => {
    if (!updatedAssignedPilots[role.id]) {
      // If the role doesn't exist in assignedPilots, add it with pilots from the role
      // This preserves pilot data when support roles are loaded from the database
      updatedAssignedPilots[role.id] = role.pilots || [];
      hasChanges = true;
    }
  });

  // Only return new object if changes were made
  return hasChanges ? updatedAssignedPilots : assignedPilots;
};
