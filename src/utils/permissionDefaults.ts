import type { UserPermissions } from '../types/PermissionTypes';
import { PERMISSION_CACHE_CONFIG, normalizeTrainingProgressScope } from '../types/PermissionTypes';

/**
 * Every permission off. The database computes the real values
 * (compute_user_permissions); this only fills keys the server row lacks.
 */
export function emptyPermissions(): UserPermissions {
  const now = Date.now();
  return {
    canAccessHome: false,
    canAccessRoster: false,
    canAccessEvents: false,
    canAccessMissionPrep: false,
    canAccessFlights: false,
    canAccessSettings: false,
    canAccessReports: false,
    canAccessMissionDebriefing: false,

    canManageRoster: [],
    canEditPilotQualifications: [],
    canDeletePilots: [],
    canManageStandings: [],
    canBulkEditRoster: [],
    canViewPublicRoster: false,

    view_pilot_dossiers: [],
    edit_pilot_dossiers: [],
    manage_awards: [],
    issue_awards: [],

    canManageEvents: [],
    canCreateTrainingCycles: [],
    canManageEventAttendance: [],
    canOverrideEventSettings: [],

    canEditOrganizationSettings: false,
    canManageSquadronSettings: [],
    canManageUserAccounts: false,
    canEditDiscordIntegration: [],

    canEditFlightAssignments: [],
    canAssignMissionRoles: [],
    canPublishToDiscord: [],
    manage_comms_templates: false,

    view_debriefs: [],
    edit_debriefs: [],
    finalize_debriefs: [],
    delegate_debriefs: [],

    manage_training_syllabi: false,
    manage_training_debriefs: false,
    submit_training_debriefs: false,
    manage_training_enrollments: false,
    view_all_training_progress: 'none',
    lock_unlock_missions: false,
    access_my_training: false,
    access_training_management: false,
    create_training_issues: false,
    resolve_training_issues: false,

    canSyncWithDiscord: [],
    canViewOwnProfile: false,

    access_developer_settings: false,

    canManagePolls: false,
    canVoteInPolls: false,
    canManageChangeLog: false,
    canReactToPosts: false,

    manage_dcs_reference_data: false,
    access_kneeboard: false,
    access_ui_kit: false,

    bases: [],
    calculatedAt: new Date(now),
    expiresAt: new Date(now + PERMISSION_CACHE_CONFIG.DURATION_MS),
  };
}

/**
 * Turn the JSON the database stored into a full UserPermissions: defaults for
 * missing keys, a wrong-typed value falls back to its default, dates as Date.
 */
export function withPermissionDefaults(raw: unknown): UserPermissions {
  const result = emptyPermissions() as unknown as Record<string, unknown>;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!(key in result)) continue;
      const fallback = result[key];
      if (key === 'view_all_training_progress') {
        result[key] = normalizeTrainingProgressScope(value);
      } else if (key === 'calculatedAt' || key === 'expiresAt') {
        const date = new Date(value as string);
        if (!Number.isNaN(date.getTime())) result[key] = date;
      } else if (Array.isArray(fallback)) {
        if (Array.isArray(value)) result[key] = value;
      } else if (typeof fallback === 'boolean') {
        if (typeof value === 'boolean') result[key] = value;
      }
    }
  }
  return result as unknown as UserPermissions;
}
