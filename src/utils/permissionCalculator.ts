import { supabase } from './supabaseClient';
import type { 
  UserPermissions, 
  UserBases, 
  PermissionRule, 
  PermissionScopeContext, 
  PermissionCheckContext,
  BasisType,
  PermissionScope
} from '../types/PermissionTypes';
import { BASIS_PRIORITIES } from '../types/PermissionTypes';

export class PermissionCalculator {
  
  /**
   * Calculate complete permissions for a user based on their bases
   */
  async calculateUserPermissions(userId: string): Promise<UserPermissions> {
    // 1. Get user's current bases (standings, qualifications, billets, assignments)
    const userBases = await this.getUserBases(userId);
    
    // 2. Get all permission rules that apply to this user
    const applicableRules = await this.getApplicableRules(userBases);
    
    // 3. Calculate effective permissions using additive model
    const permissions = this.computePermissions(applicableRules, userBases);
    
    // 4. Apply scope inheritance (Own Wing includes Own Squadron)
    this.inheritScopes(permissions, userBases);
    
    return permissions;
  }
  
  /**
   * Get user's current bases from database
   */
  private async getUserBases(userId: string): Promise<UserBases> {
    // Get user profile with pilot information
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select(`
        auth_user_id,
        pilot_id,
        pilots:pilot_id (
          id,
          pilot_assignments!pilot_assignments_pilot_id_fkey (
            id,
            squadron_id,
            start_date,
            end_date,
            org_squadrons (
              id, 
              name,
              wing_id
            )
          )
        )
      `)
      .eq('auth_user_id', userId)
      .single();
    
    if (profileError || !userProfile) {
      console.warn('Could not fetch user profile for permissions:', profileError);
      return this.createEmptyUserBases(userId);
    }
    
    const pilotId = userProfile.pilot_id;
    if (!pilotId) {
      return this.createEmptyUserBases(userId);
    }
    
    // Get current squadron assignment
    const currentAssignment = (userProfile as any).pilots?.pilot_assignments
      ?.filter((assignment: any) => !assignment.end_date)
      ?.sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];
    
    // Fetch all bases in parallel
    const [standingsResult, qualificationsResult, billetsResult, teamsResult] = await Promise.all([
      this.getCurrentStandings(pilotId),
      this.getCurrentQualifications(pilotId),
      this.getCurrentBillets(pilotId),
      this.getCurrentTeams(pilotId)
    ]);

    return {
      userId,
      pilotId,
      squadronId: currentAssignment?.org_squadrons?.id,
      wingId: currentAssignment?.org_squadrons?.wing_id,
      standings: standingsResult,
      qualifications: qualificationsResult,
      billets: billetsResult,
      teams: teamsResult,
      squadronAssignments: (userProfile as any).pilots?.pilot_assignments?.map((assignment: any) => ({
        id: assignment.org_squadrons.id,
        name: assignment.org_squadrons.name,
        startDate: assignment.start_date || '',
        endDate: assignment.end_date
      })) || []
    };
  }
  
  private createEmptyUserBases(userId: string): UserBases {
    return {
      userId,
      standings: [],
      qualifications: [],
      billets: [],
      teams: [],
      squadronAssignments: []
    };
  }
  
  /**
   * Get current standings for a pilot
   */
  private async getCurrentStandings(pilotId: string) {
    const { data, error } = await supabase
      .from('pilot_standings')
      .select(`
        standing_id,
        start_date,
        end_date,
        standings (
          id,
          name
        )
      `)
      .eq('pilot_id', pilotId)
      .or('end_date.is.null,end_date.gt.now()');
    
    if (error) {
      console.warn('Error fetching pilot standings:', error);
      return [];
    }
    
    return data?.map((item: any) => ({
      id: item.standing_id,
      name: item.standings.name,
      startDate: item.start_date || '',
      endDate: item.end_date
    })) || [];
  }
  
  /**
   * Get current qualifications for a pilot
   */
  private async getCurrentQualifications(pilotId: string) {
    const { data, error } = await supabase
      .from('pilot_qualifications')
      .select(`
        qualification_id,
        achieved_date,
        expiry_date,
        qualifications (
          id,
          name
        )
      `)
      .eq('pilot_id', pilotId)
      .or('expiry_date.is.null,expiry_date.gt.now()');
    
    if (error) {
      console.warn('Error fetching pilot qualifications:', error);
      return [];
    }
    
    return data?.map((item: any) => ({
      id: item.qualification_id,
      name: item.qualifications.name,
      achievedDate: item.achieved_date || '',
      expiryDate: item.expiry_date
    })) || [];
  }
  
  /**
   * Get current billets/roles for a pilot
   */
  private async getCurrentBillets(pilotId: string) {
    const { data, error } = await supabase
      .from('pilot_roles')
      .select(`
        role_id,
        effective_date,
        end_date,
        roles (
          id,
          name
        )
      `)
      .eq('pilot_id', pilotId)
      .or('end_date.is.null,end_date.gt.now()');

    if (error) {
      console.warn('Error fetching pilot roles:', error);
      return [];
    }

    return data?.map((item: any) => ({
      id: item.role_id || '',
      name: item.roles.name,
      effectiveDate: item.effective_date || '',
      endDate: item.end_date
    })) || [];
  }

  /**
   * Get current team memberships for a pilot
   */
  private async getCurrentTeams(pilotId: string) {
    const { data, error } = await supabase
      .from('pilot_teams')
      .select(`
        team_id,
        start_date,
        end_date,
        teams (
          id,
          name
        )
      `)
      .eq('pilot_id', pilotId)
      .or('end_date.is.null,end_date.gt.now()');

    if (error) {
      console.warn('Error fetching pilot teams:', error);
      return [];
    }

    return data?.map((item: any) => ({
      id: item.team_id || '',
      name: item.teams.name,
      startDate: item.start_date || '',
      endDate: item.end_date
    })) || [];
  }
  
  /**
   * Get all permission rules that apply to user's bases
   */
  private async getApplicableRules(userBases: UserBases): Promise<PermissionRule[]> {
    const basisIds = [
      ...userBases.standings.map(s => s.id),
      ...userBases.qualifications.map(q => q.id),
      ...userBases.billets.map(b => b.id),
      ...userBases.teams.map(t => t.id),
      ...userBases.squadronAssignments.map(s => s.id)
    ];
    
    // First, get the user's profile ID for manual_override rules
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', userBases.userId)
      .single();
    
    const userProfileId = userProfile?.id;
    
    // Get rules in separate queries for better clarity
    const queries = [];
    
    // 1. Authenticated user rules (basis_type = 'authenticated_user' AND basis_id IS NULL)
    queries.push(
      supabase
        .from('permission_rules' as any)
        .select(`
          id,
          permission_id,
          basis_type,
          basis_id,
          scope,
          active,
          created_at,
          updated_at,
          created_by,
          app_permissions!inner (
            name
          )
        `)
        .eq('active', true)
        .eq('basis_type', 'authenticated_user')
        .is('basis_id', null)
    );
    
    // 2. User's specific bases rules (standings, qualifications, billets, squadron assignments)
    if (basisIds.length > 0) {
      queries.push(
        supabase
          .from('permission_rules' as any)
          .select(`
            id,
            permission_id,
            basis_type,
            basis_id,
            scope,
            active,
            created_at,
            updated_at,
            created_by,
            app_permissions!inner (
              name
            )
          `)
          .eq('active', true)
          .in('basis_id', basisIds)
      );
    }
    
    // 3. Manual override rules for this specific user
    if (userProfileId) {
      queries.push(
        supabase
          .from('permission_rules' as any)
          .select(`
            id,
            permission_id,
            basis_type,
            basis_id,
            scope,
            active,
            created_at,
            updated_at,
            created_by,
            app_permissions!inner (
              name
            )
          `)
          .eq('active', true)
          .eq('basis_type', 'manual_override')
          .eq('basis_id', userProfileId)
      );
    }
    
    // Execute all queries in parallel
    const results = await Promise.all(queries);
    
    // Combine all results
    let allData = [];
    let hasErrors = false;
    
    for (const { data, error } of results) {
      if (error) {
        console.warn('Error fetching permission rules:', error);
        hasErrors = true;
      } else if (data) {
        allData.push(...data);
      }
    }
    
    if (hasErrors) {
      console.warn('Some permission rule queries failed');
    }
    
    
    return allData?.map(rule => ({
      id: (rule as any).id,
      permissionId: (rule as any).app_permissions.name, // Use permission name instead of UUID
      basisType: (rule as any).basis_type as BasisType,
      basisId: (rule as any).basis_id,
      scope: (rule as any).scope as PermissionScope,
      active: (rule as any).active,
      createdAt: (rule as any).created_at,
      updatedAt: (rule as any).updated_at,
      createdBy: (rule as any).created_by
    })) || [];
  }
  
  /**
   * Compute effective permissions using additive model
   */
  private computePermissions(rules: PermissionRule[], userBases: UserBases): UserPermissions {
    // Initialize empty permissions
    const permissions: UserPermissions = {
      // Navigation (boolean)
      canAccessHome: false,
      canAccessRoster: false,
      canAccessEvents: false,
      canAccessMissionPrep: false,
      canAccessFlights: false,
      canAccessSettings: false,
      canAccessReports: false,
      canAccessMissionDebriefing: false,

      // Roster (scoped)
      canManageRoster: [],
      canEditPilotQualifications: [],
      canDeletePilots: [],
      canManageStandings: [],
      canBulkEditRoster: [],
      canViewPublicRoster: false,
      
      // Events (scoped)
      canManageEvents: [],
      canCreateTrainingCycles: [],
      canManageEventAttendance: [],
      canOverrideEventSettings: [],
      
      // Settings (mixed)
      canEditOrganizationSettings: false,
      canManageSquadronSettings: [],
      canManageUserAccounts: false,
      canEditDiscordIntegration: [],
      
      // Mission Prep (scoped)
      canEditFlightAssignments: [],
      canAssignMissionRoles: [],
      canPublishToDiscord: [],

      // Mission Debriefing (scoped)
      view_debriefs: [],
      edit_debriefs: [],
      finalize_debriefs: [],
      delegate_debriefs: [],

      // Component level (mixed)
      canSyncWithDiscord: [],
      canViewOwnProfile: false,
      
      // Developer (global only)
      access_developer_settings: false,
      
      // Polls and Change Log (global only)
      canManagePolls: false,
      canVoteInPolls: false,
      canManageChangeLog: false,
      canReactToPosts: false,

      // DCS Reference Data (global only)
      manage_dcs_reference_data: false,

      // Meta
      bases: this.extractPermissionBases(userBases),
      calculatedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    };
    
    // Apply each rule additively
    for (const rule of rules) {
      this.applyRule(permissions, rule, userBases);
    }
    
    
    return permissions;
  }
  
  /**
   * Apply a single permission rule to the permissions object
   */
  private applyRule(permissions: UserPermissions, rule: PermissionRule, userBases: UserBases): void {
    const scopeContext: PermissionScopeContext = {
      type: rule.scope,
      squadronId: userBases.squadronId,
      wingId: userBases.wingId
    };
    
    // Map database permission names to permission object properties
    switch (rule.permissionId) {
      // Navigation permissions (boolean)
      case 'access_home':
        permissions.canAccessHome = true;
        break;
      case 'access_roster': 
        permissions.canAccessRoster = true;
        break;
      case 'access_events':
        permissions.canAccessEvents = true;
        break;
      case 'access_mission_prep':
        permissions.canAccessMissionPrep = true;
        break;
      case 'access_flights':
        permissions.canAccessFlights = true;
        break;
      case 'access_settings':
        permissions.canAccessSettings = true;
        break;
      case 'access_reports':
        permissions.canAccessReports = true;
        break;
      case 'access_mission_debriefing':
        permissions.canAccessMissionDebriefing = true;
        break;

      // Roster permissions (scoped)
      case 'manage_roster':
        if (!this.hasScopeContext(permissions.canManageRoster, scopeContext)) {
          permissions.canManageRoster.push(scopeContext);
        }
        break;
      case 'edit_pilot_qualifications':
        if (!this.hasScopeContext(permissions.canEditPilotQualifications, scopeContext)) {
          permissions.canEditPilotQualifications.push(scopeContext);
        }
        break;
      case 'delete_pilots':
        if (!this.hasScopeContext(permissions.canDeletePilots, scopeContext)) {
          permissions.canDeletePilots.push(scopeContext);
        }
        break;
      case 'manage_standings':
        if (!this.hasScopeContext(permissions.canManageStandings, scopeContext)) {
          permissions.canManageStandings.push(scopeContext);
        }
        break;
      case 'bulk_edit_roster':
        if (!this.hasScopeContext(permissions.canBulkEditRoster, scopeContext)) {
          permissions.canBulkEditRoster.push(scopeContext);
        }
        break;
      case 'view_public_roster':
        permissions.canViewPublicRoster = true;
        break;
        
      // Events permissions (scoped)
      case 'manage_events':
        if (!this.hasScopeContext(permissions.canManageEvents, scopeContext)) {
          permissions.canManageEvents.push(scopeContext);
        }
        break;
      case 'create_training_cycles':
        if (!this.hasScopeContext(permissions.canCreateTrainingCycles, scopeContext)) {
          permissions.canCreateTrainingCycles.push(scopeContext);
        }
        break;
      case 'manage_event_attendance':
        if (!this.hasScopeContext(permissions.canManageEventAttendance, scopeContext)) {
          permissions.canManageEventAttendance.push(scopeContext);
        }
        break;
      case 'override_event_settings':
        if (!this.hasScopeContext(permissions.canOverrideEventSettings, scopeContext)) {
          permissions.canOverrideEventSettings.push(scopeContext);
        }
        break;
        
      // Settings permissions (mixed)
      case 'edit_organization_settings':
        permissions.canEditOrganizationSettings = true;
        break;
      case 'manage_squadron_settings':
        if (!this.hasScopeContext(permissions.canManageSquadronSettings, scopeContext)) {
          permissions.canManageSquadronSettings.push(scopeContext);
        }
        break;
      case 'manage_user_accounts':
        permissions.canManageUserAccounts = true;
        break;
      case 'edit_discord_integration':
        if (!this.hasScopeContext(permissions.canEditDiscordIntegration, scopeContext)) {
          permissions.canEditDiscordIntegration.push(scopeContext);
        }
        break;
        
      // Mission prep permissions (scoped)
      case 'edit_flight_assignments':
        if (!this.hasScopeContext(permissions.canEditFlightAssignments, scopeContext)) {
          permissions.canEditFlightAssignments.push(scopeContext);
        }
        break;
      case 'assign_mission_roles':
        if (!this.hasScopeContext(permissions.canAssignMissionRoles, scopeContext)) {
          permissions.canAssignMissionRoles.push(scopeContext);
        }
        break;
      case 'publish_to_discord':
        if (!this.hasScopeContext(permissions.canPublishToDiscord, scopeContext)) {
          permissions.canPublishToDiscord.push(scopeContext);
        }
        break;

      // Mission Debriefing permissions (scoped)
      case 'view_debriefs':
        if (!this.hasScopeContext(permissions.view_debriefs, scopeContext)) {
          permissions.view_debriefs.push(scopeContext);
        }
        break;
      case 'edit_debriefs':
        if (!this.hasScopeContext(permissions.edit_debriefs, scopeContext)) {
          permissions.edit_debriefs.push(scopeContext);
        }
        break;
      case 'finalize_debriefs':
        if (!this.hasScopeContext(permissions.finalize_debriefs, scopeContext)) {
          permissions.finalize_debriefs.push(scopeContext);
        }
        break;
      case 'delegate_debriefs':
        if (!this.hasScopeContext(permissions.delegate_debriefs, scopeContext)) {
          permissions.delegate_debriefs.push(scopeContext);
        }
        break;

      // Component permissions (mixed)
      case 'sync_with_discord':
        if (!this.hasScopeContext(permissions.canSyncWithDiscord, scopeContext)) {
          permissions.canSyncWithDiscord.push(scopeContext);
        }
        break;
      case 'view_own_profile':
        permissions.canViewOwnProfile = true;
        break;
        
      // Developer permissions (global only)
      case 'access_developer_settings':
        permissions.access_developer_settings = true;
        break;
        
      // Polls and Change Log permissions (global only)
      case 'manage_polls':
        permissions.canManagePolls = true;
        break;
      case 'vote_in_polls':
        permissions.canVoteInPolls = true;
        break;
      case 'manage_change_log':
        permissions.canManageChangeLog = true;
        break;
      case 'react_to_posts':
        permissions.canReactToPosts = true;
        break;

      // DCS Reference Data permissions (global only)
      case 'manage_dcs_reference_data':
        permissions.manage_dcs_reference_data = true;
        break;
    }
  }
  
  /**
   * Check if a scope context already exists in a scope array
   */
  private hasScopeContext(scopes: PermissionScopeContext[], newScope: PermissionScopeContext): boolean {
    return scopes.some(scope =>
      scope.type === newScope.type &&
      scope.squadronId === newScope.squadronId &&
      scope.wingId === newScope.wingId &&
      scope.flightId === newScope.flightId
    );
  }
  
  /**
   * Apply scope inheritance rules (Own Wing includes Own Squadron)
   */
  private inheritScopes(permissions: UserPermissions, userBases: UserBases): void {
    const scopedPermissions: (keyof Pick<UserPermissions,
      'canManageRoster' | 'canEditPilotQualifications' | 'canDeletePilots' | 'canManageStandings' |
      'canManageEvents' | 'canCreateTrainingCycles' | 'canManageEventAttendance' | 'canOverrideEventSettings' |
      'canManageSquadronSettings' | 'canEditDiscordIntegration' |
      'canEditFlightAssignments' | 'canAssignMissionRoles' | 'canPublishToDiscord' |
      'canSyncWithDiscord' |
      'view_debriefs' | 'edit_debriefs' | 'finalize_debriefs' | 'delegate_debriefs'
    >)[] = [
      'canManageRoster', 'canEditPilotQualifications', 'canDeletePilots', 'canManageStandings',
      'canManageEvents', 'canCreateTrainingCycles', 'canManageEventAttendance', 'canOverrideEventSettings',
      'canManageSquadronSettings', 'canEditDiscordIntegration',
      'canEditFlightAssignments', 'canAssignMissionRoles', 'canPublishToDiscord',
      'canSyncWithDiscord',
      'view_debriefs', 'edit_debriefs', 'finalize_debriefs', 'delegate_debriefs'
    ];
    
    for (const permissionKey of scopedPermissions) {
      const scopes = permissions[permissionKey] as PermissionScopeContext[];
      
      // If user has own_wing scope, add own_squadron if not already present
      const hasOwnWing = scopes.some(s => s.type === 'own_wing');
      const hasOwnSquadron = scopes.some(s => s.type === 'own_squadron');
      
      if (hasOwnWing && !hasOwnSquadron && userBases.squadronId) {
        scopes.push({
          type: 'own_squadron',
          squadronId: userBases.squadronId,
          wingId: userBases.wingId
        });
      }
    }
  }
  
  /**
   * Extract permission bases for metadata
   */
  private extractPermissionBases(userBases: UserBases) {
    const bases = [];
    
    // Add standings
    for (const standing of userBases.standings) {
      bases.push({
        type: 'standing' as BasisType,
        id: standing.id,
        name: standing.name,
        priority: BASIS_PRIORITIES.standing
      });
    }
    
    // Add qualifications
    for (const qualification of userBases.qualifications) {
      bases.push({
        type: 'qualification' as BasisType,
        id: qualification.id,
        name: qualification.name,
        priority: BASIS_PRIORITIES.qualification
      });
    }
    
    // Add billets
    for (const billet of userBases.billets) {
      bases.push({
        type: 'billet' as BasisType,
        id: billet.id,
        name: billet.name,
        priority: BASIS_PRIORITIES.billet
      });
    }
    
    // Add squadron assignments
    for (const squadron of userBases.squadronAssignments) {
      if (!squadron.endDate) { // Only current assignments
        bases.push({
          type: 'squadron' as BasisType,
          id: squadron.id,
          name: squadron.name,
          priority: BASIS_PRIORITIES.squadron
        });
      }
    }
    
    return bases.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Check if user has a specific permission with optional context
   */
  checkPermission(permissions: UserPermissions, permission: string, context?: PermissionCheckContext): boolean {
    const permissionValue = permissions[permission as keyof UserPermissions];
    
    // Boolean permissions
    if (typeof permissionValue === 'boolean') {
      return permissionValue;
    }
    
    // Scoped permissions  
    if (Array.isArray(permissionValue)) {
      return this.checkScopedPermission(permissionValue as PermissionScopeContext[], context);
    }
    
    return false;
  }
  
  /**
   * Check scoped permission against context
   */
  private checkScopedPermission(scopes: PermissionScopeContext[], context?: PermissionCheckContext): boolean {
    if (!context) {
      // No context provided, check if user has any scope for this permission
      return scopes.length > 0;
    }
    
    return scopes.some(scope => {
      switch (scope.type) {
        case 'global':
          return true;
          
        case 'all_squadrons':
          return true;
          
        case 'all_wings':
          return true;
          
        case 'own_squadron':
          return context.squadronId === scope.squadronId;
          
        case 'own_wing':
          return context.wingId === scope.wingId;
          
        default:
          return false;
      }
    });
  }
}

// Export singleton instance
export const permissionCalculator = new PermissionCalculator();