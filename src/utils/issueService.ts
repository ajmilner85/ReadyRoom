import type {
  Issue,
  IssueWithDetails,
  IssueComment,
  IssueCommentWithUser,
  CreateIssueRequest,
  UpdateIssueRequest,
  CreateCommentRequest,
  IssueEntityType,
  IssuesSummary,
} from '../types/IssueTypes';
import { supabase, getCurrentUser } from './supabaseClient';

// Cast supabase to any for tables not yet in generated types
// TODO: Regenerate types after issues tables are stable
const db = supabase as any;

// Helper to get user profile ID from auth user
const getUserProfileId = async (): Promise<string> => {
  const { user, error: userError } = await getCurrentUser();
  if (userError || !user) {
    throw userError || new Error('User not authenticated');
  }

  const { data: userProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !userProfile) {
    throw new Error('User profile not found');
  }

  return userProfile.id;
};

// Get issues for a specific entity
export const getIssuesForEntity = async (
  entityType: IssueEntityType,
  entityId?: string
): Promise<IssueWithDetails[]> => {
  // Simple query first - fetch issues without joins
  let query = db
    .from('issues')
    .select('*')
    .eq('entity_type', entityType)
    .order('created_at', { ascending: false });

  if (entityId) {
    query = query.eq('entity_id', entityId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Supabase query error in getIssuesForEntity:', error);
    throw new Error(error.message || 'Failed to fetch issues');
  }

  // Now fetch user display names separately if there are issues
  const issues = data || [];
  if (issues.length === 0) {
    return [];
  }

  // Get unique user IDs
  const userIds = new Set<string>();
  issues.forEach((issue: any) => {
    if (issue.created_by) userIds.add(issue.created_by);
    if (issue.resolved_by) userIds.add(issue.resolved_by);
  });

  // Fetch user profiles
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, display_name')
    .in('id', Array.from(userIds));

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  return issues.map((issue: any) => ({
    ...issue,
    created_by_user: profileMap.get(issue.created_by) || null,
    resolved_by_user: profileMap.get(issue.resolved_by) || null,
    comment_count: 0,
  })) as IssueWithDetails[];
};

// Get all issues for a syllabus (including all mission issues)
export const getIssuesForSyllabus = async (
  syllabusId: string
): Promise<{ syllabusIssues: IssueWithDetails[]; missionIssues: IssueWithDetails[] }> => {
  // Get syllabus-level issues
  const syllabusIssues = await getIssuesForEntity('syllabus', syllabusId);

  // Get all mission IDs for this syllabus
  const { data: missions, error: missionsError } = await supabase
    .from('training_syllabus_missions')
    .select('id, mission_name')
    .eq('syllabus_id', syllabusId);

  if (missionsError) throw missionsError;

  const missionIds = (missions || []).map((m: any) => m.id);
  const missionNameMap = new Map((missions || []).map((m: any) => [m.id, m.mission_name]));

  // Get all mission issues
  let missionIssues: IssueWithDetails[] = [];
  if (missionIds.length > 0) {
    const { data, error } = await db
      .from('issues')
      .select('*')
      .eq('entity_type', 'syllabus_mission')
      .in('entity_id', missionIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const issues = data || [];
    if (issues.length > 0) {
      // Get unique user IDs
      const userIds = new Set<string>();
      issues.forEach((issue: any) => {
        if (issue.created_by) userIds.add(issue.created_by);
        if (issue.resolved_by) userIds.add(issue.resolved_by);
      });

      // Fetch user profiles
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .in('id', Array.from(userIds));

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      missionIssues = issues.map((issue: any) => ({
        ...issue,
        created_by_user: profileMap.get(issue.created_by) || null,
        resolved_by_user: profileMap.get(issue.resolved_by) || null,
        comment_count: 0,
        mission_name: missionNameMap.get(issue.entity_id) || 'Unknown Mission',
      })) as IssueWithDetails[];
    }
  }

  return { syllabusIssues, missionIssues };
};

// Create a new issue
export const createIssue = async (request: CreateIssueRequest): Promise<Issue> => {
  const profileId = await getUserProfileId();

  const { data, error } = await db
    .from('issues')
    .insert({
      entity_type: request.entity_type,
      entity_id: request.entity_id || null,
      title: request.title,
      description: request.description || null,
      priority: request.priority || 'medium',
      status: 'open',
      created_by: profileId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Issue;
};

// Update an issue
export const updateIssue = async (
  issueId: string,
  updates: UpdateIssueRequest
): Promise<Issue> => {
  const updateData: any = { ...updates };

  // Handle status change - set resolved fields
  if (updates.status === 'closed') {
    const profileId = await getUserProfileId();
    updateData.resolved_by = profileId;
    updateData.resolved_at = new Date().toISOString();
  } else if (updates.status === 'open') {
    updateData.resolved_by = null;
    updateData.resolved_at = null;
  }

  const { data, error } = await db
    .from('issues')
    .update(updateData)
    .eq('id', issueId)
    .select()
    .single();

  if (error) throw error;
  return data as Issue;
};

// Delete an issue
export const deleteIssue = async (issueId: string): Promise<void> => {
  const { error } = await db
    .from('issues')
    .delete()
    .eq('id', issueId);

  if (error) throw error;
};

// Get a single issue by ID with details
export const getIssue = async (issueId: string): Promise<IssueWithDetails | null> => {
  const { data, error } = await db
    .from('issues')
    .select('*')
    .eq('id', issueId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  // Fetch user profiles
  const userIds = [data.created_by, data.resolved_by].filter(Boolean);
  let profileMap = new Map();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, display_name')
      .in('id', userIds);
    profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  }

  return {
    ...data,
    created_by_user: profileMap.get(data.created_by) || null,
    resolved_by_user: profileMap.get(data.resolved_by) || null,
    comment_count: 0,
  } as IssueWithDetails;
};

// Get comments for an issue
export const getIssueComments = async (
  issueId: string
): Promise<IssueCommentWithUser[]> => {
  const { data, error } = await db
    .from('issue_comments')
    .select('*')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const comments = data || [];
  if (comments.length === 0) return [];

  // Fetch user profiles
  const userIds = [...new Set(comments.map((c: any) => c.created_by).filter(Boolean))] as string[];
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, display_name')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  return comments.map((comment: any) => ({
    ...comment,
    created_by_user: profileMap.get(comment.created_by) || null,
  })) as IssueCommentWithUser[];
};

// Create a comment
export const createComment = async (
  issueId: string,
  request: CreateCommentRequest
): Promise<IssueComment> => {
  const profileId = await getUserProfileId();

  const { data, error } = await db
    .from('issue_comments')
    .insert({
      issue_id: issueId,
      content: request.content,
      created_by: profileId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as IssueComment;
};

// Update a comment
export const updateComment = async (
  commentId: string,
  content: string
): Promise<IssueComment> => {
  const { data, error } = await db
    .from('issue_comments')
    .update({ content })
    .eq('id', commentId)
    .select()
    .single();

  if (error) throw error;
  return data as IssueComment;
};

// Delete a comment
export const deleteComment = async (commentId: string): Promise<void> => {
  const { error } = await db
    .from('issue_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw error;
};

// Get issues summary for an entity
export const getIssuesSummary = async (
  entityType: IssueEntityType,
  entityId?: string
): Promise<IssuesSummary> => {
  const issues = await getIssuesForEntity(entityType, entityId);

  return {
    total: issues.length,
    open: issues.filter((i) => i.status === 'open').length,
    closed: issues.filter((i) => i.status === 'closed').length,
    by_priority: {
      critical: issues.filter((i) => i.priority === 'critical').length,
      high: issues.filter((i) => i.priority === 'high').length,
      medium: issues.filter((i) => i.priority === 'medium').length,
      low: issues.filter((i) => i.priority === 'low').length,
    },
  };
};

// Get open issue count for display (e.g., in tab badges)
export const getOpenIssueCount = async (
  entityType: IssueEntityType,
  entityId?: string
): Promise<number> => {
  let query = db
    .from('issues')
    .select('id', { count: 'exact', head: true })
    .eq('entity_type', entityType)
    .eq('status', 'open');

  if (entityId) {
    query = query.eq('entity_id', entityId);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
};
