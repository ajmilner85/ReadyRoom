import { permissionService } from './permissionService';
import { supabase } from './supabaseClient';

/**
 * Helper functions for debriefing-specific permission checks
 */

/**
 * Check if user can view a specific debrief
 */
export async function canViewDebrief(
  userId: string,
  debriefId: string
): Promise<boolean> {
  try {
    // Get the debrief to check its wing
    const { data: debrief, error } = await supabase
      .from('mission_debriefings')
      .select(`
        id,
        mission:events!inner(
          wing_id,
          squadron_id
        )
      `)
      .eq('id', debriefId)
      .single();

    if (error || !debrief) {
      return false;
    }

    // Check view_debriefs permission with wing context
    const permissions = await permissionService.getUserPermissions(userId);
    const viewPermission = permissions.view_debriefs;

    if (typeof viewPermission === 'boolean') {
      return viewPermission;
    }

    if (Array.isArray(viewPermission)) {
      // Check if any scope grants access to this wing
      return viewPermission.some((scope: any) => {
        if (scope.type === 'global') return true;
        if (scope.type === 'own_wing' && scope.wingId === (debrief as any).mission.wing_id)
          return true;
        if (
          scope.type === 'own_squadron' &&
          scope.squadronId === (debrief as any).mission.squadron_id
        )
          return true;
        return false;
      });
    }

    return false;
  } catch (error) {
    console.error('Error checking view debrief permission:', error);
    return false;
  }
}

/**
 * Check if user can edit a specific debrief
 */
export async function canEditDebrief(
  userId: string,
  debriefId: string,
  pilotId?: string
): Promise<boolean> {
  try {
    // Get the debrief and check if finalized
    const { data: debrief, error } = await supabase
      .from('mission_debriefings')
      .select(`
        id,
        status,
        mission:events!inner(
          wing_id,
          squadron_id
        )
      `)
      .eq('id', debriefId)
      .single();

    if (error || !debrief) {
      return false;
    }

    // Cannot edit finalized debriefs
    if ((debrief as any).status === 'finalized') {
      return false;
    }

    // Check edit_debriefs permission
    const permissions = await permissionService.getUserPermissions(userId);
    const editPermission = permissions.edit_debriefs;

    if (typeof editPermission === 'boolean') {
      return editPermission;
    }

    if (Array.isArray(editPermission)) {
      const hasEditPermission = editPermission.some((scope: any) => {
        if (scope.type === 'global') return true;
        if (scope.type === 'own_wing' && scope.wingId === (debrief as any).mission.wing_id)
          return true;
        if (
          scope.type === 'own_squadron' &&
          scope.squadronId === (debrief as any).mission.squadron_id
        )
          return true;
        if (scope.type === 'flight' && pilotId) {
          // Check if this pilot is delegated or is flight lead
          return true; // Will be checked separately via delegation
        }
        return false;
      });

      if (hasEditPermission) return true;
    }

    // Check if user has delegation for this debrief
    if (pilotId) {
      const { data: delegation } = await supabase
        .from('debrief_delegation')
        .select('id')
        .eq('mission_debrief_id', debriefId)
        .eq('delegated_to_pilot_id', pilotId)
        .eq('revoked', false)
        .single();

      if (delegation) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking edit debrief permission:', error);
    return false;
  }
}

/**
 * Check if user can finalize a specific debrief
 */
export async function canFinalizeDebrief(
  userId: string,
  debriefId: string
): Promise<boolean> {
  try {
    // Get the debrief
    const { data: debrief, error } = await supabase
      .from('mission_debriefings')
      .select(`
        id,
        status,
        mission:events!inner(
          wing_id,
          squadron_id
        )
      `)
      .eq('id', debriefId)
      .single();

    if (error || !debrief) {
      return false;
    }

    // Already finalized
    if ((debrief as any).status === 'finalized') {
      return false;
    }

    // Check finalize_debriefs permission
    const permissions = await permissionService.getUserPermissions(userId);
    const finalizePermission = permissions.finalize_debriefs;

    if (typeof finalizePermission === 'boolean') {
      return finalizePermission;
    }

    if (Array.isArray(finalizePermission)) {
      return finalizePermission.some((scope: any) => {
        if (scope.type === 'global') return true;
        if (scope.type === 'own_wing' && scope.wingId === (debrief as any).mission.wing_id)
          return true;
        if (
          scope.type === 'own_squadron' &&
          scope.squadronId === (debrief as any).mission.squadron_id
        )
          return true;
        return false;
      });
    }

    return false;
  } catch (error) {
    console.error('Error checking finalize debrief permission:', error);
    return false;
  }
}

/**
 * Check if user can delegate debrief submission
 */
export async function canDelegateDebrief(
  userId: string,
  _debriefId: string
): Promise<boolean> {
  try {
    const permissions = await permissionService.getUserPermissions(userId);
    return permissions.delegate_debriefs.length > 0;
  } catch (error) {
    console.error('Error checking delegate permission:', error);
    return false;
  }
}
