// Issue system type definitions
// Supports polymorphic relationships to different entity types

export type IssueEntityType = 'syllabus_mission' | 'syllabus' | 'event' | 'app';
export type IssueStatus = 'open' | 'closed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';

// Base issue interface matching database schema
export interface Issue {
  id: string;
  entity_type: IssueEntityType;
  entity_id: string | null;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  created_by: string;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  updated_at: string;
}

// Issue with related user information for display
export interface IssueWithDetails extends Issue {
  created_by_user?: {
    id: string;
    display_name: string;
    pilot_id?: string | null;
    pilots?: {
      callsign: string;
      board_number: string;
    } | null;
  };
  resolved_by_user?: {
    id: string;
    display_name: string;
    pilot_id?: string | null;
    pilots?: {
      callsign: string;
      board_number: string;
    } | null;
  };
  comment_count?: number;
  // For mission issues, include the mission name for display
  mission_name?: string;
}

// Base comment interface matching database schema
export interface IssueComment {
  id: string;
  issue_id: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Comment with related user information for display
export interface IssueCommentWithUser extends IssueComment {
  created_by_user?: {
    id: string;
    display_name: string;
    pilot_id?: string | null;
    pilots?: {
      callsign: string;
      board_number: string;
    } | null;
  };
}

// Request interfaces for CRUD operations
export interface CreateIssueRequest {
  entity_type: IssueEntityType;
  entity_id?: string;
  title: string;
  description?: string;
  priority?: IssuePriority;
}

export interface UpdateIssueRequest {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
}

export interface CreateCommentRequest {
  content: string;
}

// For aggregating issues in UI
export interface IssuesSummary {
  total: number;
  open: number;
  closed: number;
  by_priority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

// Priority display configuration
export const PRIORITY_CONFIG: Record<IssuePriority, { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Critical', color: '#DC2626', bgColor: '#FEE2E2' },
  high: { label: 'High', color: '#D97706', bgColor: '#FEF3C7' },
  medium: { label: 'Medium', color: '#2563EB', bgColor: '#DBEAFE' },
  low: { label: 'Low', color: '#6B7280', bgColor: '#F3F4F6' },
};

// Status display configuration
export const STATUS_CONFIG: Record<IssueStatus, { label: string; color: string; bgColor: string }> = {
  open: { label: 'Open', color: '#047857', bgColor: '#D1FAE5' },
  closed: { label: 'Closed', color: '#6B7280', bgColor: '#F3F4F6' },
};

// Priority order for sorting
export const PRIORITY_ORDER: IssuePriority[] = ['critical', 'high', 'medium', 'low'];
